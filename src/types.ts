export type BitcoinNetwork = "mainnet" | "testnet" | "signet" | "regtest";

export type SuiNetwork = "devnet" | "testnet" | "mainnet";

export interface NetworkConfig {
    hashiObjectId: string;
    packageId: string;
    bitcoinNetwork: BitcoinNetwork;
}

export interface HashiClientOptions<Name = "HashiClient"> {
    name?: Name;
    /** Sui network — determines Hashi object IDs and default Bitcoin network. */
    network: SuiNetwork;
    /** Override the auto-resolved Hashi shared object ID (for custom/local deployments). */
    hashiObjectId?: string;
    /** Override the auto-resolved Hashi package ID (for custom/local deployments). */
    packageId?: string;
    /** Override the auto-resolved Bitcoin network for address encoding. */
    bitcoinNetwork?: BitcoinNetwork;
}
