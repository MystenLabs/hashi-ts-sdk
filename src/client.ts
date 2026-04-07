import type { ClientWithCoreApi } from "@mysten/sui/client";

export interface HashiClientOptions<Name = "HashiClient"> {
    name?: Name;
    // Add SDK-specific configuration here
}

export function hashi<const Name = "hashi">({
    name = "hashi" as Name,
    ...options
}: HashiClientOptions<Name> = {}) {
    return {
        name,
        register: (client: ClientWithCoreApi) => {
            return new HashiClient({ client, ...options });
        },
    };
}

export class HashiClient {
    #client: ClientWithCoreApi;

    constructor({ client }: { client: ClientWithCoreApi }) {
        this.#client = client;
    }
    
    async generateDepositAddress() {}
    async deposit() {}
    async withdraw() {}
    async requestSignetFaucet() {}

    // Transaction builders
    tx = {};
    
    // Move call helpers - use generated functions with typed options 
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
