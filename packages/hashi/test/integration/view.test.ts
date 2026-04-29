import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { HashiClient, hashi } from "../../src/client.js";
import { SuiGrpcClient } from "@mysten/sui/grpc";

/**
 * Integration tests for `HashiClient.view.*` against the live Sui devnet.
 *
 * Each test fires real gRPC calls. A 5-second spacer runs after every
 * test to avoid rate limiting. Values are checked as loose invariants
 * (types, positivity, floor relationships) rather than exact matches,
 * because devnet governance can change the on-chain parameters.
 */
describe("HashiClient.view (devnet)", () => {
    let client: SuiGrpcClient & { hashi: HashiClient };

    beforeAll(() => {
        client = new SuiGrpcClient({
            network: "devnet",
            baseUrl: "https://fullnode.devnet.sui.io:443",
        }).$extend(hashi({ network: "devnet" }));
    });

    // 5s spacing between devnet hits — placed after each test so the
    // first one starts immediately but subsequent calls aren't hammered.
    afterEach(() => new Promise((resolve) => setTimeout(resolve, 5000)));

    const TIMEOUT = 30_000;

    it(
        "all returns a full governance snapshot in a single round-trip",
        async () => {
            const snap = await client.hashi.view.all();

            expect(typeof snap.paused).toBe("boolean");
            expect(typeof snap.bitcoinChainId).toBe("string");
            expect(snap.bitcoinChainId).toMatch(/^0x[0-9a-f]{64}$/);
            expect(typeof snap.bitcoinDepositMinimum).toBe("bigint");
            expect(typeof snap.bitcoinWithdrawalMinimum).toBe("bigint");
            expect(typeof snap.bitcoinConfirmationThreshold).toBe("bigint");
            expect(typeof snap.withdrawalCancellationCooldownMs).toBe("bigint");
            expect(typeof snap.depositMinimum).toBe("bigint");
            expect(typeof snap.worstCaseNetworkFee).toBe("bigint");
        },
        TIMEOUT,
    );

    it(
        "mpcPublicKey returns a 33-byte compressed secp256k1 key",
        async () => {
            const key = await client.hashi.view.mpcPublicKey();
            expect(key).toBeInstanceOf(Uint8Array);
            expect(key.length).toBe(33);
            expect(key[0]).toBeOneOf([0x02, 0x03]);
        },
        TIMEOUT,
    );

    it(
        "paused returns a boolean",
        async () => {
            const paused = await client.hashi.view.paused();
            expect(typeof paused).toBe("boolean");
        },
        TIMEOUT,
    );

    it(
        "bitcoinDepositMinimum is at least DUST_RELAY_MIN_VALUE (546)",
        async () => {
            const min = await client.hashi.view.bitcoinDepositMinimum();
            expect(min).toBeGreaterThanOrEqual(546n);
        },
        TIMEOUT,
    );

    it(
        "bitcoinWithdrawalMinimum is at least DUST_RELAY_MIN_VALUE + 1 (547)",
        async () => {
            const min = await client.hashi.view.bitcoinWithdrawalMinimum();
            expect(min).toBeGreaterThanOrEqual(547n);
        },
        TIMEOUT,
    );

    it(
        "bitcoinConfirmationThreshold is positive",
        async () => {
            const n = await client.hashi.view.bitcoinConfirmationThreshold();
            expect(n).toBeGreaterThan(0n);
        },
        TIMEOUT,
    );

    it(
        "withdrawalCancellationCooldownMs is positive",
        async () => {
            const ms = await client.hashi.view.withdrawalCancellationCooldownMs();
            expect(ms).toBeGreaterThan(0n);
        },
        TIMEOUT,
    );

    it(
        "bitcoinChainId is a 0x-prefixed 32-byte hex address",
        async () => {
            const id = await client.hashi.view.bitcoinChainId();
            expect(id).toMatch(/^0x[0-9a-f]{64}$/);
        },
        TIMEOUT,
    );

    it(
        "depositMinimum equals bitcoinDepositMinimum",
        async () => {
            const snap = await client.hashi.view.all();
            expect(snap.depositMinimum).toBe(snap.bitcoinDepositMinimum);
        },
        TIMEOUT,
    );

    it(
        "worstCaseNetworkFee equals bitcoinWithdrawalMinimum - 546",
        async () => {
            const snap = await client.hashi.view.all();
            expect(snap.worstCaseNetworkFee).toBe(snap.bitcoinWithdrawalMinimum - 546n);
            expect(snap.worstCaseNetworkFee).toBeGreaterThanOrEqual(1n);
        },
        TIMEOUT,
    );
});
