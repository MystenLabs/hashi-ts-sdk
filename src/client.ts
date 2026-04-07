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
    #client: ClientWithCoreApi;
    #hashiObjectId: string;
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
        const mpcKey = await this.#fetchMpcPublicKey();

        const addressBytes = fromHex(suiAddress);

        return generateDepositAddressRaw(mpcKey, addressBytes, network);
    }

    async #fetchMpcPublicKey(): Promise<Uint8Array> {
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
    }

    async deposit() {}
    async withdraw() {}
    async requestSignetFaucet() {}

    tx = {};

    // Move call helpers — use generated functions with typed options
    call = {};

    view = {
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
