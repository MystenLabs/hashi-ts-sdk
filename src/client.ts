import type { ClientWithCoreApi } from "@mysten/sui/client";
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
import type { BitcoinNetwork, GovernanceConfig, HashiClientOptions, SuiNetwork } from "./types.js";

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

    async deposit() {}
    async withdraw() {}

    // User-facing transaction builders — compose `call.*` thunks into a full
    // PTB and return the unsigned `Transaction`. Execution (sign + dry-run +
    // submit) is the direct-method layer's concern and happens elsewhere.
    tx = {
        /**
         * Build a transaction that submits a Bitcoin deposit for committee
         * confirmation. Composes `utxo::utxo_id` → `utxo::utxo` → `deposit::deposit`
         * in a single PTB so the `Utxo` struct is constructed inline.
         */
        deposit: (options: {
            /** 0x-prefixed 32-byte Bitcoin txid of the funding transaction. */
            txid: string;
            /** Output index (u32) within that Bitcoin transaction. */
            vout: number;
            /** Amount in sats (u64). Must be ≥ the on-chain deposit minimum. */
            amount: bigint;
            /**
             * Sui address that should receive the minted BTC — goes into the
             * deposit's `derivation_path` as `Some(addr)`. Typically the same
             * address used to derive the Bitcoin deposit address via
             * `generateDepositAddress`.
             */
            suiAddress: string;
        }): Transaction => {
            const tx = new Transaction();
            const utxoId = tx.add(
                utxoModule.utxoId({
                    package: this.#packageId,
                    arguments: { txid: options.txid, vout: options.vout },
                }),
            );
            const utxo = tx.add(
                utxoModule.utxo({
                    package: this.#packageId,
                    arguments: {
                        utxoId,
                        amount: options.amount,
                        derivationPath: options.suiAddress,
                    },
                }),
            );
            tx.add(this.call.deposit({ utxo }));
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
     * Parses the `Hashi.config.config` VecMap contents into a typed snapshot of
     * all governance values, applying the same floors as the Move accessors.
     * Throws a structured error if any expected key is missing or has an
     * unexpected variant — never silently defaults.
     */
    #parseConfig(
        contents: Array<{ key: string; value: { $kind: string; [k: string]: unknown } }>,
    ): GovernanceConfig {
        const entry = (key: string) => {
            const e = contents.find((c) => c.key === key);
            if (!e) throw new Error(`Config key "${key}" not found on-chain.`);
            return e.value;
        };
        const u64 = (key: string): bigint => {
            const v = entry(key);
            if (v.$kind !== "U64") {
                throw new Error(`Config key "${key}" is ${v.$kind}, expected U64.`);
            }
            return BigInt(v.U64 as string);
        };
        const bool = (key: string): boolean => {
            const v = entry(key);
            if (v.$kind !== "Bool") {
                throw new Error(`Config key "${key}" is ${v.$kind}, expected Bool.`);
            }
            return v.Bool as boolean;
        };
        const addr = (key: string): string => {
            const v = entry(key);
            if (v.$kind !== "Address") {
                throw new Error(`Config key "${key}" is ${v.$kind}, expected Address.`);
            }
            return v.Address as string;
        };

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
            const result = await Hashi.get({
                client: this.#client,
                objectId: this.#hashiObjectId,
            });
            return this.#parseConfig(result.json.config.config.contents);
        },

        /** Whether deposits and withdrawals are currently paused by governance. */
        paused: async (): Promise<boolean> => (await this.view.all()).paused,

        /** Minimum deposit in satoshis. Floored at 546 (`DUST_RELAY_MIN_VALUE`). */
        bitcoinDepositMinimum: async (): Promise<bigint> =>
            (await this.view.all()).bitcoinDepositMinimum,

        /** Minimum withdrawal in satoshis. Floored at 547 (`DUST_RELAY_MIN_VALUE + 1`). */
        bitcoinWithdrawalMinimum: async (): Promise<bigint> =>
            (await this.view.all()).bitcoinWithdrawalMinimum,

        /** Number of Bitcoin confirmations required before a deposit is accepted. */
        bitcoinConfirmationThreshold: async (): Promise<bigint> =>
            (await this.view.all()).bitcoinConfirmationThreshold,

        /** Cooldown in milliseconds before a pending withdrawal can be cancelled. */
        withdrawalCancellationCooldownMs: async (): Promise<bigint> =>
            (await this.view.all()).withdrawalCancellationCooldownMs,

        /** Bitcoin chain identifier (0x-hex 32-byte address) this Hashi instance binds to. */
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
