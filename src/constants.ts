import type { BitcoinNetwork } from "./bitcoin.js";
import type { SuiNetwork } from "./client.js";

export interface NetworkConfig {
    hashiObjectId: string;
    packageId: string;
    bitcoinNetwork: BitcoinNetwork;
}

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

export const NETWORK_CONFIG: Partial<Record<SuiNetwork, NetworkConfig>> = {
    devnet: {
        hashiObjectId: "0x4bf35fb393067d0502b9a976f2753add04b69b58d6ca948e8d452b650f609a87",
        packageId: "0xeef9dd622a37cbb614f06faa83abfb870eebc50a4c997ba0d2d86171123c0a08",
        bitcoinNetwork: "signet",
    },
};
