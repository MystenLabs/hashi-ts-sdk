import { describe, it, expect } from "vitest";
import {
    deriveChildPubkey,
    taprootScriptPathAddress,
    generateDepositAddress,
} from "../../src/bitcoin.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";

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
});
