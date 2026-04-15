import type { ClientWithCoreApi } from "@mysten/sui/client";
import { fromHex } from "@mysten/sui/utils";
import type { Transaction } from "@mysten/sui/transactions";
import { Hashi } from "./contracts/hashi/hashi.js";
import * as depositModule from "./contracts/hashi/deposit.js";
import * as withdrawModule from "./contracts/hashi/withdraw.js";
import type { RawTransactionArgument } from "./contracts/utils/index.js";
import { generateDepositAddress as generateDepositAddressRaw } from "./bitcoin.js";
import { NETWORK_CONFIG } from "./constants.js";
import type { BitcoinNetwork, HashiClientOptions, SuiNetwork } from "./types.js";

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
        deposit: (_options: {
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
            throw new Error("TODO");
        },

        /**
         * Build a transaction that submits a BTC withdrawal request. Sources the
         * BTC via `coinWithBalance`, unwraps it into a `Balance<BTC>`, and passes
         * it to `withdraw::request_withdrawal` along with the target Bitcoin
         * output address.
         */
        requestWithdrawal: (_options: {
            /** Amount in sats to withdraw. Must be ≥ the on-chain withdrawal minimum. */
            amount: bigint;
            /**
             * Target Bitcoin address as raw witness program bytes — 20 bytes for
             * P2WPKH, 32 bytes for P2TR. Callers decode their own bech32(m)
             * strings for now; a string-input overload may land in a follow-up.
             */
            bitcoinAddress: Uint8Array;
        }): Transaction => {
            throw new Error("TODO");
        },

        /**
         * Build a transaction that cancels a pending withdrawal request and
         * returns the locked BTC to the user. Consumes the `Balance<BTC>`
         * hot-potato returned by `withdraw::cancel_withdrawal` by wrapping it
         * into a `Coin<BTC>` and transferring to `recipient`.
         */
        cancelWithdrawal: (_options: {
            /** The withdrawal request ID to cancel. */
            requestId: string;
            /** Recipient of the returned BTC coin. Defaults to the tx sender. */
            recipient?: string;
        }): Transaction => {
            throw new Error("TODO");
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

            return mpcKey;
        },
        // TODO: implement Governance-related view methods
        bitcoinDepositMinimum: async (): Promise<bigint> => {
            throw new Error("TODO");
        },
        bitcoinWithdrawalMinimum: async (): Promise<bigint> => {
            throw new Error("TODO");
        },
        bitcoinConfirmationThreshold: async (): Promise<bigint> => {
            throw new Error("TODO");
        },
        paused: async (): Promise<boolean> => {
            throw new Error("TODO");
        },
        withdrawalCancellationCooldownMs: async (): Promise<bigint> => {
            throw new Error("TODO");
        },
        bitcoinChainId: async (): Promise<string> => {
            throw new Error("TODO");
        },
        depositMinimum: async (): Promise<bigint> => {
            throw new Error("TODO");
        },
        worstCaseNetworkFee: async (): Promise<bigint> => {
            throw new Error("TODO");
        },
    };
}
