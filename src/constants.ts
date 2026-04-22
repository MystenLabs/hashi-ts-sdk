import type { BitcoinNetwork, NetworkConfig, SuiNetwork } from "./types.js";

export const NETWORK_HRP: Record<BitcoinNetwork, string> = {
    mainnet: "bc",
    testnet: "tb",
    signet: "tb",
    regtest: "bcrt",
};

/**
 * BIP-341 Nothing-Up-My-Sleeve (NUMS) internal key.
 * Has no known private key, which forces all taproot spends through the script path.
 */
// prettier-ignore
export const NUMS_KEY = new Uint8Array([
    0x50, 0x92, 0x9b, 0x74, 0xc1, 0xa0, 0x49, 0x54,
    0xb7, 0x8b, 0x4b, 0x60, 0x35, 0xe9, 0x7a, 0x5e,
    0x07, 0x8a, 0x5a, 0x0f, 0x28, 0xec, 0x96, 0xd5,
    0x47, 0xbf, 0xee, 0x9a, 0xce, 0x80, 0x3a, 0xc0,
]);

/**
 * The Move side uses this as a floor on `bitcoin_deposit_minimum` and
 * `bitcoin_withdrawal_minimum`; the SDK replicates the same floors so `view.*`
 * matches on-chain semantics. Mirrors `DUST_RELAY_MIN_VALUE` in
 * `hashi::btc_config`.
 */
export const DUST_RELAY_MIN_VALUE = 546n;

export const NETWORK_CONFIG: Partial<Record<SuiNetwork, NetworkConfig>> = {
    devnet: {
        hashiObjectId: "0x8182f3b79d090b4988626d27c09d61585627bc25aa86ec791c70530336316746",
        packageId: "0x5962b40c4b24f70e63ad78f644748f3f2145367a1838c3347650127db927baa0",
        bitcoinNetwork: "signet",
    },
};
