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

/**
 * Frozen snapshot of every governance-controlled protocol parameter, returned
 * by `HashiClient.view.all()`. Fields are `readonly` because the snapshot is
 * a point-in-time read from chain — mutating it locally cannot change on-chain
 * state. `depositMinimum` is a Move-side alias of `bitcoinDepositMinimum`;
 * `worstCaseNetworkFee` is derived as `bitcoinWithdrawalMinimum - 546` (the
 * dust relay floor) and is always ≥ 1.
 */
export interface GovernanceConfig {
    readonly paused: boolean;
    readonly bitcoinChainId: string;
    readonly bitcoinDepositMinimum: bigint;
    readonly bitcoinWithdrawalMinimum: bigint;
    readonly bitcoinConfirmationThreshold: bigint;
    readonly withdrawalCancellationCooldownMs: bigint;
    readonly depositMinimum: bigint;
    readonly worstCaseNetworkFee: bigint;
}

/**
 * A single UTXO output within a Bitcoin transaction used to fund a deposit.
 * `vout` is the output index (Bitcoin u32); `amountSats` must be ≥ the
 * on-chain deposit minimum (enforced at deposit time).
 */
export interface UtxoOutput {
    readonly vout: number;
    readonly amountSats: bigint;
}

/** Parameters for `HashiClient.deposit()` — one Bitcoin txid, one or more outputs paying the deposit address. */
export interface DepositParams {
    /** 0x-prefixed 32-byte Bitcoin txid of the funding transaction. */
    readonly txid: string;
    /** UTXOs from `txid` that paid the deposit address (one per output to the address). */
    readonly utxos: readonly UtxoOutput[];
    /**
     * Sui address that derived the deposit address and will receive the minted
     * hBTC. Becomes the `derivation_path` of every `Utxo` built in the PTB.
     */
    readonly recipient: string;
}
