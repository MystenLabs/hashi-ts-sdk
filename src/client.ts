import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";
import { fromHex } from "@mysten/sui/utils";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { Hashi } from "./contracts/hashi/hashi.js";
import * as depositModule from "./contracts/hashi/deposit.js";
import * as withdrawModule from "./contracts/hashi/withdraw.js";
import * as utxoModule from "./contracts/hashi/utxo.js";
import type { RawTransactionArgument } from "./contracts/utils/index.js";
import {
    generateDepositAddress as generateDepositAddressRaw,
    arkworksToSec1Compressed,
} from "./bitcoin.js";
import { DUST_RELAY_MIN_VALUE, NETWORK_CONFIG } from "./constants.js";
import type { AmountViolation } from "./errors.js";
import {
    AmountBelowMinimumError,
    HashiConfigError,
    HashiFetchError,
    HashiPausedError,
    InvalidDepositParamsError,
} from "./errors.js";
import type {
    BitcoinNetwork,
    DepositParams,
    GovernanceConfig,
    HashiClientOptions,
    SuiNetwork,
} from "./types.js";
import { assertHex32, entry, type ConfigEntry } from "./util.js";

/** Max value of an unsigned 32-bit integer; vout is a u32 on the Bitcoin side. */
const U32_MAX = 0xffffffff;

export function hashi<const Name = "hashi">({
    name = "hashi" as Name,
    ...options
}: HashiClientOptions<Name>) {
    return {
        name,
        register: (client: ClientWithCoreApi) => {
            return new HashiClient({ client, ...options });
        },
    };
}

/**
 * User-facing SDK client for the Hashi protocol. Constructed via the
 * `hashi({...})` factory and attached to any Sui client via `$extend`:
 *
 * ```ts
 * const client = new SuiGrpcClient({ ... }).$extend(hashi({ network: "devnet" }));
 * const result = await client.hashi.deposit({ signer, ... });
 * ```
 *
 * **Direct methods (`deposit`, `withdraw`) sign and execute transactions** on
 * behalf of the caller — pass a `Signer` and receive the execution result.
 * For composable flows (bundling into a larger PTB, sponsored transactions,
 * dry-run/simulation), use the `tx.*` builders instead; they return unsigned
 * `Transaction` objects and leave signing to the caller.
 */
export class HashiClient {
    #client: ClientWithCoreApi;
    #hashiObjectId: string;
    #packageId: string;
    #bitcoinNetwork: BitcoinNetwork;

    constructor({
        client,
        network,
        hashiObjectId,
        packageId,
        bitcoinNetwork,
    }: {
        client: ClientWithCoreApi;
        network: SuiNetwork;
        hashiObjectId?: string;
        packageId?: string;
        bitcoinNetwork?: BitcoinNetwork;
    }) {
        const config = NETWORK_CONFIG[network];
        const resolvedObjectId = hashiObjectId ?? config?.hashiObjectId;
        const resolvedPackageId = packageId ?? config?.packageId;
        if (!resolvedObjectId || !resolvedPackageId) {
            throw new Error(
                `Hashi is not yet supported on Sui ${network}. Provide a custom hashiObjectId and packageId.`,
            );
        }
        this.#client = client;
        this.#hashiObjectId = resolvedObjectId;
        this.#packageId = resolvedPackageId;
        this.#bitcoinNetwork = bitcoinNetwork ?? config?.bitcoinNetwork ?? "testnet";
    }

    /**
     * Generates a unique Bitcoin P2TR deposit address for a Sui address.
     *
     * Fetches the MPC committee public key from on-chain, derives a child key
     * using the Sui address, and builds a taproot script-path address.
     *
     * @example
     * ```ts
     * const btcAddress = await client.hashi.generateDepositAddress({
     *   suiAddress: signer.toSuiAddress(),
     * });
     * ```
     */
    async generateDepositAddress({
        suiAddress,
        bitcoinNetwork = this.#bitcoinNetwork,
    }: {
        /** The Sui address to generate a deposit address for (hex string with 0x prefix). */
        suiAddress: string;
        /** Override the default Bitcoin network for this call. */
        bitcoinNetwork?: BitcoinNetwork;
    }): Promise<string> {
        const mpcKey = await this.view.mpcPublicKey();
        const addressBytes = fromHex(suiAddress);
        return generateDepositAddressRaw(mpcKey, addressBytes, bitcoinNetwork);
    }

    /**
     * Submit one or more Bitcoin deposits for committee confirmation, batched
     * into a single Sui PTB. Signs with `signer` and submits, returning the
     * execution result (`$kind: "Transaction" | "FailedTransaction"`). The
     * result includes `effects` and `events` so callers can confirm
     * `DepositRequestedEvent` without an extra round-trip.
     *
     * The method runs three preflight stages before signing:
     *
     *   1. **Structural validation** — `txid` and `recipient` must be
     *      0x-prefixed 32-byte hex; `utxos` must be non-empty; every `vout`
     *      must be a non-negative u32 and unique within the call. Violations
     *      throw `InvalidDepositParamsError` without any chain read.
     *   2. **Pause check** — reads the governance snapshot via `view.all()`
     *      and throws `HashiPausedError` if `paused` is `true`. Mirrors the
     *      Move-side `hashi::assert_unpaused`.
     *   3. **Minimum check** — every UTXO must have `amountSats ≥
     *      snap.bitcoinDepositMinimum`. All offenders are collected into one
     *      `AmountBelowMinimumError`, so callers can fix the batch in one
     *      round-trip. Mirrors `EBelowMinimumDeposit` in `deposit::deposit`.
     *
     * Both chain-reading checks (2, 3) read from the same `view.all()`
     * snapshot, so validation is internally consistent. Chain state can still
     * drift between the snapshot and execution — the Move side re-asserts
     * both invariants, so a genuine race simply aborts the tx.
     *
     * For composable flows (sponsored tx, dry-run, or bundling into a larger
     * PTB), use `tx.deposit(params)` instead — it returns the unsigned
     * `Transaction` and leaves signing to the caller.
     */
    async deposit({
        signer,
        ...params
    }: DepositParams & {
        /** Signs and pays for the resulting transaction. The signer's address becomes the tx sender. */
        signer: Signer;
    }) {
        this.#validateDepositParams(params);

        const snap = await this.view.all();
        if (snap.paused) {
            throw new HashiPausedError({ operation: "deposit" });
        }

        const violations: AmountViolation[] = [];
        for (const { vout, amountSats } of params.utxos) {
            if (amountSats < snap.bitcoinDepositMinimum) {
                violations.push({
                    amount: amountSats,
                    minimum: snap.bitcoinDepositMinimum,
                    vout,
                });
            }
        }
        if (violations.length > 0) {
            throw new AmountBelowMinimumError({ violations });
        }

        const transaction = this.tx.deposit(params);
        return this.#client.core.signAndExecuteTransaction({
            signer,
            transaction,
            include: { effects: true, events: true },
        });
    }
    async withdraw() {}

    #validateDepositParams(params: DepositParams): void {
        assertHex32(params.txid, "txid");
        assertHex32(params.recipient, "recipient");
        if (params.utxos.length === 0) {
            throw new InvalidDepositParamsError({
                reason: "`utxos` must contain at least one UTXO",
            });
        }
        const seen = new Set<number>();
        for (const { vout } of params.utxos) {
            if (!Number.isInteger(vout) || vout < 0 || vout > U32_MAX) {
                throw new InvalidDepositParamsError({
                    reason: "`vout` must be a non-negative u32 integer",
                    detail: `got ${JSON.stringify(vout)}`,
                });
            }
            if (seen.has(vout)) {
                throw new InvalidDepositParamsError({
                    reason: "duplicate `vout` within a single deposit",
                    detail: `vout ${vout} appears more than once (each output of a single txid must be unique)`,
                });
            }
            seen.add(vout);
        }
    }

    // User-facing transaction builders — compose `call.*` thunks into a full
    // PTB and return the unsigned `Transaction`. Execution (sign + dry-run +
    // submit) is the direct-method layer's concern and happens elsewhere.
    tx = {
        /**
         * Build a transaction that submits one or more Bitcoin deposits for
         * committee confirmation, batched into a single Sui PTB.
         *
         * A single Bitcoin funding tx can pay the same deposit address on
         * multiple outputs (e.g. change + donation, or a coinjoin). Rather
         * than forcing the user to submit one Sui tx per output, this method
         * accepts every qualifying output and emits a dedicated Move-call
         * triple per UTXO:
         *
         *     utxo::utxo_id(txid, vout_i)   → UtxoId
         *     utxo::utxo(utxoId, amount_i, derivationPath = recipient)  → Utxo
         *     deposit::deposit(hashi, utxo)
         *
         * The triples are emitted in `params.utxos` order, so N UTXOs yield
         * exactly `3 * N` PTB commands.
         *
         * Because all triples live in one PTB, execution is atomic: either
         * every deposit is recorded, or none are (any abort — wrong minimum,
         * replayed UTXO, paused system — reverts the whole transaction).
         *
         * All UTXOs share the `txid` because `DepositParams` has a single
         * top-level `txid` field, and are credited to the same `recipient`.
         *
         * @example
         * ```ts
         * const tx = client.hashi.tx.deposit({
         *   txid: `0x${btcTxid}`,
         *   utxos: [
         *     { vout: 0, amountSats: 100_000n },
         *     { vout: 2, amountSats:  50_000n },
         *   ],
         *   recipient: signer.toSuiAddress(),
         * });
         * await client.signAndExecuteTransaction({ signer, transaction: tx });
         * ```
         */
        deposit: (params: DepositParams): Transaction => {
            const tx = new Transaction();
            for (const { vout, amountSats } of params.utxos) {
                const utxoId = tx.add(
                    utxoModule.utxoId({
                        package: this.#packageId,
                        arguments: { txid: params.txid, vout },
                    }),
                );
                const utxo = tx.add(
                    utxoModule.utxo({
                        package: this.#packageId,
                        arguments: {
                            utxoId,
                            amount: amountSats,
                            derivationPath: params.recipient,
                        },
                    }),
                );
                tx.add(this.call.deposit({ utxo }));
            }
            return tx;
        },

        /**
         * Build a transaction that submits a BTC withdrawal request. Sources the
         * BTC via `coinWithBalance`, unwraps it into a `Balance<BTC>`, and passes
         * it to `withdraw::request_withdrawal` along with the target Bitcoin
         * output address.
         */
        requestWithdrawal: (options: {
            /** Amount in sats to withdraw. Must be ≥ the on-chain withdrawal minimum. */
            amount: bigint;
            /**
             * Target Bitcoin address as raw witness program bytes — 20 bytes for
             * P2WPKH, 32 bytes for P2TR. Callers decode their own bech32(m)
             * strings for now; a string-input overload may land in a follow-up.
             */
            bitcoinAddress: Uint8Array;
        }): Transaction => {
            const tx = new Transaction();
            const btcType = `${this.#packageId}::btc::BTC`;
            const coin = tx.add(
                coinWithBalance({
                    type: btcType,
                    balance: options.amount,
                    useGasCoin: false,
                }),
            );
            const [balance] = tx.moveCall({
                package: "0x2",
                module: "coin",
                function: "into_balance",
                typeArguments: [btcType],
                arguments: [coin],
            });
            tx.add(
                this.call.requestWithdrawal({
                    btc: balance,
                    bitcoinAddress: Array.from(options.bitcoinAddress),
                }),
            );
            return tx;
        },

        /**
         * Build a transaction that cancels a pending withdrawal request and
         * returns the locked BTC to the user. Consumes the `Balance<BTC>`
         * hot-potato returned by `withdraw::cancel_withdrawal` by wrapping it
         * into a `Coin<BTC>` and transferring to `recipient`.
         */
        cancelWithdrawal: (options: {
            /** The withdrawal request ID to cancel. */
            requestId: string;
            /**
             * Sui address that will receive the returned `Coin<BTC>`. Required
             * because the unsigned `Transaction` does not know its sender at
             * build time — the caller must pass their own address explicitly.
             */
            recipient: string;
        }): Transaction => {
            const tx = new Transaction();
            const balance = tx.add(this.call.cancelWithdrawal({ requestId: options.requestId }));
            const [coin] = tx.moveCall({
                package: "0x2",
                module: "coin",
                function: "from_balance",
                typeArguments: [`${this.#packageId}::btc::BTC`],
                arguments: [balance],
            });
            tx.transferObjects([coin], options.recipient);
            return tx;
        },
    };

    // Move call helpers — thin wrappers over generated bindings that auto-inject
    // the Hashi shared object and the resolved package id. Each returns a thunk
    // suitable for `tx.add(...)`. Only user-facing Hashi calls are exposed here;
    // operator/committee calls are intentionally not part of this surface.
    call = {
        deposit: (options: { utxo: RawTransactionArgument<string> }) =>
            depositModule.deposit({
                package: this.#packageId,
                arguments: { hashi: this.#hashiObjectId, utxo: options.utxo },
            }),
        requestWithdrawal: (options: {
            btc: RawTransactionArgument<string>;
            bitcoinAddress: RawTransactionArgument<number[]>;
        }) =>
            withdrawModule.requestWithdrawal({
                package: this.#packageId,
                arguments: {
                    hashi: this.#hashiObjectId,
                    btc: options.btc,
                    bitcoinAddress: options.bitcoinAddress,
                },
            }),
        /**
         * Cancel a pending withdrawal request. Returns a `Balance<BTC>` hot potato
         * that must be consumed in the same PTB (e.g. wrapped into a Coin and
         * transferred back to the sender).
         */
        cancelWithdrawal: (options: { requestId: RawTransactionArgument<string> }) =>
            withdrawModule.cancelWithdrawal({
                package: this.#packageId,
                arguments: { hashi: this.#hashiObjectId, requestId: options.requestId },
            }),
    };

    /**
     * Parses the `Hashi.config.config` VecMap contents into a typed snapshot,
     * applying the same floors as the Move accessors so the SDK matches
     * on-chain semantics exactly.
     */
    #parseConfig(contents: readonly ConfigEntry[]): GovernanceConfig {
        const u64 = (key: string): bigint => {
            const v = entry(contents, key, "U64");
            try {
                return BigInt(v.U64);
            } catch (cause) {
                throw HashiConfigError.malformedPayload(
                    key,
                    "U64",
                    `"${v.U64}" is not a valid integer`,
                    cause,
                );
            }
        };
        const bool = (key: string): boolean => entry(contents, key, "Bool").Bool;
        const addr = (key: string): string => entry(contents, key, "Address").Address;

        const rawDepositMin = u64("bitcoin_deposit_minimum");
        const rawWithdrawalMin = u64("bitcoin_withdrawal_minimum");
        const bitcoinDepositMinimum =
            rawDepositMin < DUST_RELAY_MIN_VALUE ? DUST_RELAY_MIN_VALUE : rawDepositMin;
        const bitcoinWithdrawalMinimum =
            rawWithdrawalMin < DUST_RELAY_MIN_VALUE + 1n
                ? DUST_RELAY_MIN_VALUE + 1n
                : rawWithdrawalMin;

        return {
            paused: bool("paused"),
            bitcoinChainId: addr("bitcoin_chain_id"),
            bitcoinDepositMinimum,
            bitcoinWithdrawalMinimum,
            bitcoinConfirmationThreshold: u64("bitcoin_confirmation_threshold"),
            withdrawalCancellationCooldownMs: u64("withdrawal_cancellation_cooldown_ms"),
            depositMinimum: bitcoinDepositMinimum,
            worstCaseNetworkFee: bitcoinWithdrawalMinimum - DUST_RELAY_MIN_VALUE,
        };
    }

    view = {
        /**
         * Fetches the MPC committee's threshold public key from on-chain.
         *
         * This is the 33-byte compressed secp256k1 key stored in `CommitteeSet.mpc_public_key`.
         * It is set after the committee completes DKG and is updated at epoch boundaries.
         *
         * @returns 33-byte compressed secp256k1 public key
         * @throws If the MPC key is not yet available (DKG not completed)
         */
        mpcPublicKey: async (): Promise<Uint8Array> => {
            const result = await Hashi.get({
                client: this.#client,
                objectId: this.#hashiObjectId,
            });

            const mpcKey = new Uint8Array(result.json.committee_set.mpc_public_key);

            if (mpcKey.length === 0) {
                throw new Error(
                    "MPC public key not available on-chain. Has the committee completed DKG?",
                );
            }

            return arkworksToSec1Compressed(mpcKey);
        },

        /**
         * Fetches all governance values in a single round-trip and returns a
         * consistent snapshot. Prefer this over individual methods when you
         * need 2+ values — it avoids redundant `Hashi.get` calls and gives
         * you all fields from the same on-chain state.
         */
        all: async (): Promise<GovernanceConfig> => {
            let result;
            try {
                result = await Hashi.get({
                    client: this.#client,
                    objectId: this.#hashiObjectId,
                });
            } catch (cause) {
                throw new HashiFetchError(
                    `Failed to fetch Hashi shared object ${this.#hashiObjectId}.`,
                    this.#hashiObjectId,
                    { cause },
                );
            }
            const contents = result.json?.config?.config?.contents;
            if (!Array.isArray(contents)) {
                throw new HashiFetchError(
                    `Hashi object ${this.#hashiObjectId} returned an unexpected shape: config.config.contents is not an array.`,
                    this.#hashiObjectId,
                );
            }
            return this.#parseConfig(contents);
        },

        paused: async (): Promise<boolean> => (await this.view.all()).paused,

        /** Floored to `DUST_RELAY_MIN_VALUE` if the on-chain value is lower. */
        bitcoinDepositMinimum: async (): Promise<bigint> =>
            (await this.view.all()).bitcoinDepositMinimum,

        /** Floored to `DUST_RELAY_MIN_VALUE + 1` so `worstCaseNetworkFee` is always ≥ 1. */
        bitcoinWithdrawalMinimum: async (): Promise<bigint> =>
            (await this.view.all()).bitcoinWithdrawalMinimum,

        bitcoinConfirmationThreshold: async (): Promise<bigint> =>
            (await this.view.all()).bitcoinConfirmationThreshold,

        withdrawalCancellationCooldownMs: async (): Promise<bigint> =>
            (await this.view.all()).withdrawalCancellationCooldownMs,

        bitcoinChainId: async (): Promise<string> => (await this.view.all()).bitcoinChainId,

        /** Alias of `bitcoinDepositMinimum`. */
        depositMinimum: async (): Promise<bigint> => (await this.view.all()).depositMinimum,

        /**
         * Worst-case Bitcoin miner fee (sats) deducted from a withdrawal.
         * Derived as `bitcoinWithdrawalMinimum - DUST_RELAY_MIN_VALUE`; always ≥ 1.
         */
        worstCaseNetworkFee: async (): Promise<bigint> =>
            (await this.view.all()).worstCaseNetworkFee,
    };
}
