/**
 * Bitcoin address derivation for Hashi deposit addresses.
 *
 * Each Sui address maps to a unique P2TR (Pay-to-Taproot) Bitcoin deposit address,
 * derived from the MPC committee's master public key.
 *
 * @see https://mystenlabs.github.io/hashi/design/address-scheme.html
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { bech32m } from "@scure/base";
import { NETWORK_HRP, NUMS_KEY } from "./constants.js";

// ---------------------------------------------------------------------------
//  Types & Constants
// ---------------------------------------------------------------------------

export type BitcoinNetwork = "mainnet" | "testnet" | "signet" | "regtest";

const Point = secp256k1.Point;
const CURVE_ORDER = Point.CURVE().n;

const NUMS_POINT = Point.fromBytes(concatBytes(new Uint8Array([0x02]), NUMS_KEY));

// ---------------------------------------------------------------------------
//  Internal helpers
// ---------------------------------------------------------------------------

/** BIP-340 tagged hash: SHA256(SHA256(tag) ‖ SHA256(tag) ‖ msg) */
function taggedHash(tag: string, ...msgs: Uint8Array[]): Uint8Array {
    const tagHash = sha256(new TextEncoder().encode(tag));
    return sha256(concatBytes(tagHash, tagHash, ...msgs));
}

/** Interpret a byte array as a big-endian unsigned integer. */
function bytesToNumberBE(bytes: Uint8Array): bigint {
    let n = 0n;
    for (const byte of bytes) {
        n = (n << 8n) | BigInt(byte);
    }
    return n;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Derives a child x-only public key from the MPC master key and a Sui address.
 *
 * Replicates `fastcrypto_tbls::threshold_schnorr::key_derivation::derive_verifying_key`:
 *
 * ```text
 * tweak = HKDF-SHA3-256(ikm = parent_x ‖ sui_address, len = 64) mod n
 * child = parent + tweak × G
 * ```
 *
 * @param mpcKeyCompressed - 33-byte compressed secp256k1 public key
 *   (from on-chain `CommitteeSet.mpc_public_key`)
 * @param suiAddress - 32-byte Sui address used as the derivation path
 * @returns 32-byte x-only public key of the derived child
 */
export function deriveChildPubkey(
    mpcKeyCompressed: Uint8Array,
    suiAddress: Uint8Array,
): Uint8Array {
    if (mpcKeyCompressed.length !== 33) {
        throw new Error(`Expected 33-byte compressed MPC key, got ${mpcKeyCompressed.length}`);
    }
    if (suiAddress.length !== 32) {
        throw new Error(`Expected 32-byte Sui address, got ${suiAddress.length}`);
    }

    // Parse the compressed key, preserving y-parity from the prefix byte.
    const parentPoint = Point.fromBytes(mpcKeyCompressed);

    // x-coordinate is bytes [1..33] of the compressed representation.
    const xBytes = mpcKeyCompressed.slice(1);

    // HKDF-SHA3-256(ikm = x ‖ address, salt = ∅, info = ∅, len = 64)
    const ikm = concatBytes(xBytes, suiAddress);
    const tweakBytes = hkdf(sha3_256, ikm, undefined, undefined, 64);

    // Reduce the 64-byte big-endian integer mod the secp256k1 group order.
    const tweakScalar = bytesToNumberBE(tweakBytes) % CURVE_ORDER;

    // child = parent + tweak × G
    const childPoint = parentPoint.add(Point.BASE.multiply(tweakScalar));

    // Return the x-coordinate (32 bytes). The x value is the same regardless
    // of whether the child point has even or odd y.
    return childPoint.toBytes(true).slice(1);
}

/**
 * Builds a P2TR script-path-only address: `tr(NUMS, pk(pubkey))`.
 *
 * Creates a taproot output with a single leaf containing `<pubkey> OP_CHECKSIG`
 * and the BIP-341 NUMS internal key (no key-path spend possible).
 *
 * @param pubkey - 32-byte x-only public key for the script leaf
 * @param network - Bitcoin network for the bech32m human-readable prefix
 * @returns bech32m-encoded P2TR address (e.g. `bc1p…`, `tb1p…`, `bcrt1p…`)
 */
export function taprootScriptPathAddress(pubkey: Uint8Array, network: BitcoinNetwork): string {
    if (pubkey.length !== 32) {
        throw new Error(`Expected 32-byte x-only pubkey, got ${pubkey.length}`);
    }

    // Tapscript: OP_PUSHBYTES_32 <pubkey> OP_CHECKSIG
    const tapscript = new Uint8Array(34);
    tapscript[0] = 0x20; // OP_PUSHBYTES_32
    tapscript.set(pubkey, 1);
    tapscript[33] = 0xac; // OP_CHECKSIG

    // Leaf hash (BIP-341): tagged_hash("TapLeaf", leaf_version ‖ compact_size(len) ‖ script)
    const leafPrefix = new Uint8Array([0xc0, tapscript.length]); // v0xC0, len=34
    const leafHash = taggedHash("TapLeaf", leafPrefix, tapscript);

    // Tweak (BIP-341): tagged_hash("TapTweak", internal_key ‖ merkle_root)
    // With a single leaf, the merkle root IS the leaf hash.
    const tweak = taggedHash("TapTweak", NUMS_KEY, leafHash);
    const tweakScalar = bytesToNumberBE(tweak) % CURVE_ORDER;

    // Output key = NUMS + tweak × G
    const outputPoint = NUMS_POINT.add(Point.BASE.multiply(tweakScalar));
    const outputKey = outputPoint.toBytes(true).slice(1); // 32-byte x-only

    // bech32m: witness version 1 ‖ witness program
    const words = [1, ...bech32m.toWords(outputKey)];
    return bech32m.encode(NETWORK_HRP[network], words);
}

/**
 * Generates a Bitcoin P2TR deposit address for a Sui address.
 *
 * This implements the devnet address scheme:
 * ```
 * tr(NUMS, pk(derive(H, d)))
 * ```
 * where `H` is the MPC master key and `d` is the depositor's Sui address.
 *
 * For mainnet the descriptor includes the guardian key:
 * `tr(NUMS, multi_a(2, guardian, derive(H, d)))` — not yet implemented here.
 *
 * @param mpcKeyCompressed - 33-byte compressed secp256k1 MPC public key
 * @param suiAddress - 32-byte Sui address
 * @param network - Bitcoin network
 * @returns bech32m-encoded P2TR deposit address
 */
export function generateDepositAddress(
    mpcKeyCompressed: Uint8Array,
    suiAddress: Uint8Array,
    network: BitcoinNetwork,
): string {
    const childXOnly = deriveChildPubkey(mpcKeyCompressed, suiAddress);
    return taprootScriptPathAddress(childXOnly, network);
}
