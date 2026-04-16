import { describe, it, expect } from "vitest";
import {
    deriveChildPubkey,
    taprootScriptPathAddress,
    generateDepositAddress,
    arkworksToSec1Compressed,
} from "../../src/bitcoin.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { fromHex } from "@mysten/sui/utils";

/**
 * Deterministic test key: secret key = 2 (matching TEST_HASHI_BTC_SK in bitcoin_utils.rs tests).
 * The compressed public key is derived from this scalar.
 */
const TEST_SECRET_KEY = new Uint8Array(32);
TEST_SECRET_KEY[31] = 2; // scalar = 2
const TEST_COMPRESSED_KEY = secp256k1.getPublicKey(TEST_SECRET_KEY, true);

const ZERO_ADDRESS = new Uint8Array(32); // 0x000…000

describe("deriveChildPubkey", () => {
    it("returns a 32-byte x-only key", () => {
        const child = deriveChildPubkey(TEST_COMPRESSED_KEY, ZERO_ADDRESS);
        expect(child).toBeInstanceOf(Uint8Array);
        expect(child.length).toBe(32);
    });

    it("produces different keys for different Sui addresses", () => {
        const addr1 = new Uint8Array(32);
        addr1[31] = 1;
        const addr2 = new Uint8Array(32);
        addr2[31] = 2;

        const child1 = deriveChildPubkey(TEST_COMPRESSED_KEY, addr1);
        const child2 = deriveChildPubkey(TEST_COMPRESSED_KEY, addr2);

        expect(child1).not.toEqual(child2);
    });

    it("is deterministic", () => {
        const a = deriveChildPubkey(TEST_COMPRESSED_KEY, ZERO_ADDRESS);
        const b = deriveChildPubkey(TEST_COMPRESSED_KEY, ZERO_ADDRESS);
        expect(a).toEqual(b);
    });

    it("throws for wrong key length", () => {
        expect(() => deriveChildPubkey(new Uint8Array(32), ZERO_ADDRESS)).toThrow("33-byte");
    });

    it("throws for wrong address length", () => {
        expect(() => deriveChildPubkey(TEST_COMPRESSED_KEY, new Uint8Array(20))).toThrow("32-byte");
    });
});

describe("arkworksToSec1Compressed", () => {
    it("converts a known arkworks key to valid SEC1 compressed format", () => {
        // Known devnet MPC key in arkworks format
        const ark = fromHex("0x466d7e0035ec8c4b3056d28c9faab29228a89332a12dec1a6a68aaa5669d9e0380");
        const sec1 = arkworksToSec1Compressed(ark);

        expect(sec1.length).toBe(33);
        // SEC1 prefix must be 0x02 or 0x03
        expect([0x02, 0x03]).toContain(sec1[0]);
        // x-coordinate should be the LE bytes reversed to BE
        expect(Buffer.from(sec1.slice(1)).toString("hex")).toBe(
            "039e9d66a5aa686a1aec2da13293a82892b2aa9f8cd256304b8cec35007e6d46",
        );
    });

    it("round-trips a SEC1 key through arkworks encoding", () => {
        // Build an arkworks-encoded version of TEST_COMPRESSED_KEY (SEC1, secret=2):
        // SEC1: prefix(1) + x_be(32).  Arkworks: x_le(32) + flags(1).
        const xBe = TEST_COMPRESSED_KEY.slice(1); // 32-byte BE x-coordinate
        const xLe = new Uint8Array(xBe).reverse(); // LE

        // Determine arkworks flag: y > (p-1)/2 → bit 7
        const Point = secp256k1.Point;
        const point = Point.fromBytes(TEST_COMPRESSED_KEY);
        const y = point.toAffine().y;
        const p = Point.CURVE().p;
        const yIsNeg = y > (p - 1n) / 2n;

        const ark = new Uint8Array(33);
        ark.set(xLe, 0);
        ark[32] = yIsNeg ? 0x80 : 0x00;

        const sec1 = arkworksToSec1Compressed(ark);

        // Must recover the original SEC1 compressed key
        expect(sec1).toEqual(TEST_COMPRESSED_KEY);
    });

    it("throws for wrong length", () => {
        expect(() => arkworksToSec1Compressed(new Uint8Array(32))).toThrow("33-byte");
    });
});

describe("taprootScriptPathAddress", () => {
    // Use the derived child key as input
    const childKey = deriveChildPubkey(TEST_COMPRESSED_KEY, ZERO_ADDRESS);

    it("returns a bech32m address with correct prefix", () => {
        expect(taprootScriptPathAddress(childKey, "mainnet")).toMatch(/^bc1p/);
        expect(taprootScriptPathAddress(childKey, "testnet")).toMatch(/^tb1p/);
        expect(taprootScriptPathAddress(childKey, "signet")).toMatch(/^tb1p/);
        expect(taprootScriptPathAddress(childKey, "regtest")).toMatch(/^bcrt1p/);
    });

    it("is deterministic", () => {
        const a = taprootScriptPathAddress(childKey, "testnet");
        const b = taprootScriptPathAddress(childKey, "testnet");
        expect(a).toBe(b);
    });

    it("produces different addresses for different keys", () => {
        const addr1 = new Uint8Array(32);
        addr1[31] = 1;
        const otherChild = deriveChildPubkey(TEST_COMPRESSED_KEY, addr1);

        const a = taprootScriptPathAddress(childKey, "testnet");
        const b = taprootScriptPathAddress(otherChild, "testnet");
        expect(a).not.toBe(b);
    });
});

describe("generateDepositAddress", () => {
    it("produces a valid P2TR address end-to-end", () => {
        const addr = new Uint8Array(32);
        addr[31] = 0x42;

        const btcAddress = generateDepositAddress(TEST_COMPRESSED_KEY, addr, "regtest");

        expect(btcAddress).toMatch(/^bcrt1p/);
        // P2TR bech32m addresses are 62 chars for mainnet, longer for regtest
        expect(btcAddress.length).toBeGreaterThan(40);
    });

    it("matches manual two-step derivation", () => {
        const suiAddr = new Uint8Array(32);
        suiAddr[0] = 0xab;

        const composed = generateDepositAddress(TEST_COMPRESSED_KEY, suiAddr, "testnet");

        const child = deriveChildPubkey(TEST_COMPRESSED_KEY, suiAddr);
        const manual = taprootScriptPathAddress(child, "testnet");

        expect(composed).toBe(manual);
    });

    /**
     * Cross-language test vectors using the same constants as the Rust tests
     * in `hashi-types/src/guardian/bitcoin_utils.rs`:
     *   TEST_HASHI_BTC_SK = [2u8; 32]  (secret scalar = 2)
     *
     * These vectors should be added to the Rust test suite as well so that
     * both implementations assert the same expected addresses.
     */
    it("matches cross-language vector: secret=2, zero address, regtest", () => {
        const btcAddress = generateDepositAddress(TEST_COMPRESSED_KEY, ZERO_ADDRESS, "regtest");
        expect(btcAddress).toBe("bcrt1phljz7xzha5m52dudgkrd3z3lly8287wyspgazmd8zktrvvz07n6q37kevt");
    });

    it("matches cross-language vector: secret=2, address=0x01, regtest", () => {
        const addr = new Uint8Array(32);
        addr[31] = 1;
        const btcAddress = generateDepositAddress(TEST_COMPRESSED_KEY, addr, "regtest");
        expect(btcAddress).toBe("bcrt1phgk8napk468tyq07t4m834gk80yhz0yrw7z8qcfqcc0pzfcm44jseq66p8");
    });

    it("matches a known reference vector", () => {
        // 33-byte arkworks-compressed MPC master public key (from devnet CommitteeSet.mpc_public_key).
        const MPC_MASTER_KEY_HEX =
            "0x466d7e0035ec8c4b3056d28c9faab29228a89332a12dec1a6a68aaa5669d9e0380";
        const SUI_ADDRESS_HEX =
            "0xe40c8cf8b53822829b3a6dc9aea84b62653f60b771e9da4bd4e214cae851b87b";
        const EXPECTED_BTC_ADDRESS =
            "tb1pcftamwsj3yehmpq7zpkchp40qqk7ecfjr2d3jl8ptne52erfc7squm4rw2";
        const NETWORK = "signet" as const;

        const mpcKey = arkworksToSec1Compressed(fromHex(MPC_MASTER_KEY_HEX));
        const suiAddress = fromHex(SUI_ADDRESS_HEX);

        const btcAddress = generateDepositAddress(mpcKey, suiAddress, NETWORK);

        expect(btcAddress).toBe(EXPECTED_BTC_ADDRESS);
    });
});
