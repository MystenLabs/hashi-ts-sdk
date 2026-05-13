/**
 * Bitcoin address derivation for Hashi deposit addresses.
 *
 * Hashi bridges Bitcoin and Sui by assigning each Sui address a unique Bitcoin
 * deposit address. When BTC is sent to that address, the Hashi MPC committee
 * detects the deposit and mints equivalent tokens on Sui.
 *
 * The deposit address is a Pay-to-Taproot (P2TR / BIP-341) script-path address
 * whose spending condition is a single `OP_CHECKSIG` against a child public key
 * derived from the MPC committee's master key and the depositor's Sui address.
 *
 * The full derivation pipeline is:
 *
 * 1. **Fetch** the MPC master key from on-chain (`CommitteeSet.mpc_public_key`).
 *    The on-chain bytes use the arkworks compressed format (little-endian x +
 *    flag byte), so they must first be converted to SEC1 via
 *    {@link arkworksToSec1Compressed} — this is done automatically by the
 *    client's `view.mpcPublicKey()` method.
 *
 * 2. **Derive** a child key: `child = masterKey + HKDF-SHA3-256(x ‖ suiAddr) × G`
 *    (see {@link deriveChildPubkey}). This replicates the Rust function
 *    `fastcrypto_tbls::threshold_schnorr::key_derivation::derive_verifying_key`.
 *
 * 3. **Build** the taproot address: `tr(NUMS, pk(child))` where NUMS is a
 *    Nothing-Up-My-Sleeve point with no known private key, forcing all spends
 *    through the script path (see {@link taprootScriptPathAddress}).
 *
 * The end-to-end helper {@link generateDepositAddress} combines steps 2–3.
 *
 * @see https://mystenlabs.github.io/hashi/design/address-scheme.html
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { bech32, bech32m } from "@scure/base";
import { NETWORK_HRP, NUMS_KEY } from "./constants.js";
import { InvalidBitcoinAddressError } from "./errors.js";

import type { BitcoinNetwork } from "./types.js";

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
//  Format conversion
// ---------------------------------------------------------------------------

/**
 * Converts a 33-byte arkworks-compressed secp256k1 point to 33-byte SEC1 compressed format.
 *
 * The on-chain `CommitteeSet.mpc_public_key` is serialised with `ark-serialize`
 * (via `bcs::to_bytes` in the Rust node), which uses a different compressed
 * layout than the SEC1/X9.62 standard that `@noble/curves` expects:
 *
 * | Property       | ark-serialize              | SEC1 (noble)             |
 * |----------------|----------------------------|--------------------------|
 * | Byte order     | **little-endian** x        | **big-endian** x         |
 * | Y-parity       | flag in **last** byte      | prefix **first** byte    |
 * | Parity meaning | "negative" (y > (p-1)/2)   | even / odd (y mod 2)     |
 *
 * Because the parity conventions differ, we cannot simply remap the flag bit —
 * we must lift the x-coordinate onto the curve to recover y, then check its
 * parity in both systems.
 *
 * @param ark - 33-byte arkworks-compressed point
 *   (bytes [0..32] = x in little-endian, byte [32] = flags with bit 7 = y_is_negative)
 * @returns 33-byte SEC1 compressed point (prefix 0x02 | 0x03, then x in big-endian)
 */
export function arkworksToSec1Compressed(ark: Uint8Array): Uint8Array {
    if (ark.length !== 33) {
        throw new Error(`Expected 33-byte arkworks-compressed key, got ${ark.length}`);
    }

    const flags = ark[32];
    const yIsNegative = (flags >> 7) & 1; // bit 7: y > (p-1)/2 in arkworks

    // x-coordinate: first 32 bytes in LE → reverse to BE.
    const xBe = new Uint8Array(ark.slice(0, 32)).reverse();

    // Lift x onto the curve with a trial SEC1 prefix (0x02 = even y).
    const trial = new Uint8Array(33);
    trial[0] = 0x02;
    trial.set(xBe, 1);

    const trialPoint = Point.fromBytes(trial);
    const y = trialPoint.toAffine().y;

    // arkworks "negative" = y > (p-1)/2.  Determine whether the trial y satisfies that.
    const p = Point.CURVE().p;
    const trialIsNeg = y > (p - 1n) / 2n;

    // If the trial parity doesn't match the arkworks flag, flip the prefix.
    const prefix = (yIsNegative === 1) !== trialIsNeg ? 0x03 : 0x02;

    const sec1 = new Uint8Array(33);
    sec1[0] = prefix;
    sec1.set(xBe, 1);
    return sec1;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Derives a child x-only public key from the MPC master key and a Sui address.
 *
 * This is the core key-derivation step that gives each Sui address its own
 * unique Bitcoin public key. The MPC committee can sign for this child key
 * (using threshold Schnorr with additive tweaking), which is what authorises
 * a withdrawal transaction on the Bitcoin side.
 *
 * Replicates the Rust function
 * `fastcrypto_tbls::threshold_schnorr::key_derivation::derive_verifying_key`:
 *
 * ```text
 * tweak = HKDF-SHA3-256(ikm = parent_x ‖ sui_address, len = 64) mod n
 * child = parent + tweak × G
 * ```
 *
 * The tweak is derived deterministically from the master key's x-coordinate
 * concatenated with the depositor's Sui address, using HKDF with SHA3-256 as
 * the underlying hash. The 64-byte output is reduced mod n (the secp256k1
 * group order) to produce a scalar, which is then used as an additive tweak
 * on the master public key.
 *
 * The returned value is the 32-byte x-only form of the child key (the
 * x-coordinate only, without a parity prefix). This is the format expected
 * by BIP-340 Schnorr signatures and BIP-341 taproot constructions.
 *
 * @param mpcKeyCompressed - 33-byte SEC1 compressed secp256k1 public key
 *   (the MPC master key, after arkworks-to-SEC1 conversion)
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
 * A BIP-341 taproot output has two spending paths: the *key path* (spend with
 * the internal key) and the *script path* (reveal and satisfy a script in the
 * Merkle tree). By using the NUMS (Nothing-Up-My-Sleeve) point as the internal
 * key — a point with no known discrete logarithm — the key path is provably
 * unspendable, forcing every spend through the script path.
 *
 * The script tree contains a single leaf: `<pubkey> OP_CHECKSIG`, meaning the
 * MPC committee must produce a valid Schnorr signature for `pubkey` to spend
 * the output. This is how the committee authorises withdrawals.
 *
 * The taproot output key is computed per BIP-341:
 * ```text
 * leafHash   = tagged_hash("TapLeaf",   0xC0 ‖ compact_size(script) ‖ script)
 * tweak      = tagged_hash("TapTweak",  NUMS ‖ leafHash)
 * outputKey  = NUMS + tweak × G
 * ```
 *
 * The resulting output key is encoded as a SegWit v1 witness program in a
 * bech32m address.
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
 * This is the main entry point for the address derivation pipeline. Given the
 * MPC master key and a Sui address, it produces the unique Bitcoin deposit
 * address where a user should send BTC in order to receive bridged tokens on
 * Sui.
 *
 * Combines {@link deriveChildPubkey} (child key derivation) and
 * {@link taprootScriptPathAddress} (taproot address construction) into a
 * single call.
 *
 * The current devnet address scheme uses a single-key script path:
 * ```text
 * tr(NUMS, pk(derive(H, d)))
 * ```
 * where `H` is the MPC master key and `d` is the depositor's Sui address.
 *
 * For mainnet the descriptor will include the guardian key:
 * `tr(NUMS, multi_a(2, guardian, derive(H, d)))` — not yet implemented here.
 *
 * @param mpcKeyCompressed - 33-byte SEC1 compressed secp256k1 MPC public key
 *   (the MPC master key, after arkworks-to-SEC1 conversion)
 * @param suiAddress - 32-byte Sui address
 * @param network - Bitcoin network (determines the bech32m address prefix)
 * @returns bech32m-encoded P2TR deposit address (e.g. `tb1p…` for signet)
 */
export function generateDepositAddress(
    mpcKeyCompressed: Uint8Array,
    suiAddress: Uint8Array,
    network: BitcoinNetwork,
): string {
    const childXOnly = deriveChildPubkey(mpcKeyCompressed, suiAddress);
    return taprootScriptPathAddress(childXOnly, network);
}

// ---------------------------------------------------------------------------
//  Withdrawal address decoding
// ---------------------------------------------------------------------------

/**
 * Decodes a bech32/bech32m SegWit Bitcoin address into a witness program.
 *
 * Hashi withdrawals send BTC to a witness-program output, so the SDK only
 * accepts the two address types the MPC committee currently supports:
 *
 *   - **P2WPKH** — witness version 0, 20-byte program (`bc1q…`, `tb1q…`)
 *   - **P2TR**   — witness version 1, 32-byte program (`bc1p…`, `tb1p…`)
 *
 * Legacy base58 addresses (`1…`, `3…`) aren't bech32 at all and surface as
 * `"malformed"`. Version-0 32-byte P2WSH is rejected (no committee support).
 *
 * Per BIP-350, v0 must use a bech32 checksum and v1+ must use bech32m. This
 * function enforces that rule strictly — a v0 address encoded as bech32m
 * (or vice versa) fails with `"bad-checksum"`.
 *
 * @param address - User-supplied Bitcoin address string
 * @param network - Expected Bitcoin network; the HRP must match
 * @returns `{ version, program }` — witness version + raw program bytes
 * @throws {@link InvalidBitcoinAddressError} with a structured `code` on any failure
 */
export function bitcoinAddressToWitnessProgram(
    address: string,
    network: BitcoinNetwork,
): { version: number; program: Uint8Array } {
    const expectedHrp = NETWORK_HRP[network];

    // Try both checksum variants and record which one validated. We defer the
    // BIP-350 version ↔ variant enforcement until after we know the version,
    // so we can emit a targeted `"bad-checksum"` instead of a generic parse
    // failure when the user encoded with the wrong variant.
    let decoded: { prefix: string; words: number[] } | undefined;
    let variant: "bech32" | "bech32m" | undefined;
    try {
        decoded = bech32.decode(address as `${string}1${string}`);
        variant = "bech32";
    } catch {
        // fall through to bech32m
    }
    if (!decoded) {
        try {
            decoded = bech32m.decode(address as `${string}1${string}`);
            variant = "bech32m";
        } catch (cause) {
            throw new InvalidBitcoinAddressError(
                {
                    address,
                    code: "malformed",
                    message: `Bitcoin address "${address}" is not valid bech32 or bech32m.`,
                },
                { cause },
            );
        }
    }

    if (decoded.words.length === 0) {
        throw new InvalidBitcoinAddressError({
            address,
            code: "malformed",
            message: `Bitcoin address "${address}" has no data payload.`,
        });
    }

    const version = decoded.words[0];

    // BIP-350: witness v0 → bech32, v1+ → bech32m. Cross-variant encodings
    // are malformed per spec even if the bits decode cleanly.
    const expectedVariant = version === 0 ? "bech32" : "bech32m";
    if (variant !== expectedVariant) {
        throw new InvalidBitcoinAddressError({
            address,
            code: "bad-checksum",
            message:
                `Bitcoin address "${address}" has witness version ${version} but a ` +
                `${variant} checksum; BIP-350 requires ${expectedVariant} for this version.`,
        });
    }

    if (decoded.prefix !== expectedHrp) {
        throw new InvalidBitcoinAddressError({
            address,
            code: "wrong-network",
            message:
                `Bitcoin address "${address}" uses HRP "${decoded.prefix}" but the client ` +
                `is configured for ${network} (expected "${expectedHrp}").`,
        });
    }

    if (version !== 0 && version !== 1) {
        throw new InvalidBitcoinAddressError({
            address,
            code: "unsupported-version",
            message:
                `Bitcoin address "${address}" has witness version ${version}; ` +
                `Hashi supports only v0 (P2WPKH) and v1 (P2TR).`,
        });
    }

    const program = bech32.fromWords(decoded.words.slice(1));

    const expectedLen = version === 0 ? 20 : 32;
    if (program.length !== expectedLen) {
        throw new InvalidBitcoinAddressError({
            address,
            code: "bad-program-length",
            message:
                `Bitcoin address "${address}" has a ${program.length}-byte witness program; ` +
                `v${version} (${version === 0 ? "P2WPKH" : "P2TR"}) requires ${expectedLen} bytes.`,
        });
    }

    return { version, program };
}

/**
 * Encodes a witness program back into a bech32/bech32m Bitcoin address.
 *
 * Inverse of {@link bitcoinAddressToWitnessProgram}. Useful for displaying
 * the Bitcoin address associated with a withdrawal request whose on-chain
 * state stores only the raw witness program bytes.
 *
 * @param program - Raw witness program bytes (20 for P2WPKH, 32 for P2TR)
 * @param network - Bitcoin network for the HRP
 * @returns Encoded bech32 (v0) or bech32m (v1+) address
 */
export function witnessProgramToAddress(
    program: Uint8Array,
    network: BitcoinNetwork,
): string {
    const hrp = NETWORK_HRP[network];

    if (program.length === 20) {
        const words = [0, ...bech32.toWords(program)];
        return bech32.encode(hrp, words);
    }

    if (program.length === 32) {
        const words = [1, ...bech32m.toWords(program)];
        return bech32m.encode(hrp, words);
    }

    throw new Error(
        `Unsupported witness program length ${program.length}; expected 20 (P2WPKH) or 32 (P2TR).`,
    );
}
