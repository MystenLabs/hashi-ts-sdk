import type { ClientWithCoreApi } from "@mysten/sui/client";
import { fromHex } from "@mysten/sui/utils";
import { Hashi } from "./contracts/hashi/hashi.js";
import {
    generateDepositAddress as generateDepositAddressRaw,
    type BitcoinNetwork,
} from "./bitcoin.js";

export interface HashiClientOptions<Name = "HashiClient"> {
    name?: Name;
    /** Object ID of the shared Hashi object on Sui. */
    hashiObjectId: string;
    /** Bitcoin network for address encoding (default: `"testnet"`). */
    network?: BitcoinNetwork;
}

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
    // TODO: make sure that this client is gRPC. 
    #client: ClientWithCoreApi;
    // TODO: The hashi object id should be hard-coded depending on mainnet/testnet/devnet or the user could provide a custom one.
    #hashiObjectId: string;
    // TODO: network should be either mainnet, testnet or devnet like sui.
    //  Then, each option can be mapped to the bitcoin network equivalent. E.g. devnet -> signet
    #network: BitcoinNetwork; 

    constructor({
        client,
        hashiObjectId,
        network = "testnet",
    }: {
        client: ClientWithCoreApi;
        hashiObjectId: string;
        network?: BitcoinNetwork;
    }) {
        this.#client = client;
        this.#hashiObjectId = hashiObjectId;
        this.#network = network;
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
        network = this.#network,
    }: {
        /** The Sui address to generate a deposit address for (hex string with 0x prefix). */
        suiAddress: string;
        /** Override the default Bitcoin network for this call. */
        network?: BitcoinNetwork;
    }): Promise<string> {
        const mpcKey = await this.view.mpcPublicKey();

        const addressBytes = fromHex(suiAddress);

        return generateDepositAddressRaw(mpcKey, addressBytes, network);
    }

    async deposit() {}
    async withdraw() {}
    async requestSignetFaucet() {}

    tx = {};

    // Move call helpers — use generated functions with typed options
    call = {};

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

            const mpcKey = new Uint8Array(
                result.json.committee_set.mpc_public_key,
            );

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
