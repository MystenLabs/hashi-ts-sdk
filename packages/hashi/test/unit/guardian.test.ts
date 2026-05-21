import { describe, it, expect } from "vitest";
import { projectCapacity, estimateWaitSecs } from "../../src/guardian.js";
import type { GuardianLimiterConfig, GuardianLimiterState } from "../../src/types.js";

const config: GuardianLimiterConfig = {
    refillRateSatsPerSec: 1_000n,
    maxBucketCapacitySats: 2_000_000n,
};

function state(overrides?: Partial<GuardianLimiterState>): GuardianLimiterState {
    return {
        numTokensAvailableSats: 0n,
        lastUpdatedAtSecs: 0n,
        nextSeq: 0n,
        ...overrides,
    };
}

describe("projectCapacity", () => {
    it("refills linearly over time", () => {
        const s = state();
        expect(projectCapacity(config, s, 100n)).toBe(100_000n);
    });

    it("caps at maxBucketCapacitySats", () => {
        const s = state();
        expect(projectCapacity(config, s, 10_000n)).toBe(2_000_000n);
    });

    it("returns existing tokens when no time has elapsed", () => {
        const s = state({ numTokensAvailableSats: 500_000n, lastUpdatedAtSecs: 50n });
        expect(projectCapacity(config, s, 50n)).toBe(500_000n);
    });

    it("adds refill to existing tokens", () => {
        const s = state({ numTokensAvailableSats: 500_000n, lastUpdatedAtSecs: 50n });
        expect(projectCapacity(config, s, 150n)).toBe(600_000n);
    });

    it("clamps refill + existing to max", () => {
        const s = state({ numTokensAvailableSats: 1_999_000n, lastUpdatedAtSecs: 0n });
        expect(projectCapacity(config, s, 100n)).toBe(2_000_000n);
    });

    it("handles timestamp before lastUpdatedAt gracefully (no negative)", () => {
        const s = state({ lastUpdatedAtSecs: 100n });
        expect(projectCapacity(config, s, 50n)).toBe(0n);
    });

    it("handles already-full bucket", () => {
        const s = state({ numTokensAvailableSats: 2_000_000n, lastUpdatedAtSecs: 0n });
        expect(projectCapacity(config, s, 1_000n)).toBe(2_000_000n);
    });

    it("handles zero refill rate", () => {
        const zeroConfig = { ...config, refillRateSatsPerSec: 0n };
        const s = state({ numTokensAvailableSats: 500n });
        expect(projectCapacity(zeroConfig, s, 9999n)).toBe(500n);
    });
});

describe("estimateWaitSecs", () => {
    it("returns 0n when capacity already available", () => {
        const s = state({ numTokensAvailableSats: 1_000_000n });
        expect(estimateWaitSecs(config, s, 500_000n, 0n)).toBe(0n);
    });

    it("returns null when amount exceeds max bucket capacity", () => {
        const s = state();
        expect(estimateWaitSecs(config, s, 2_000_001n, 0n)).toBeNull();
    });

    it("computes wait from empty bucket", () => {
        const s = state();
        // Need 1_000_000 sats, refill rate 1_000/sec → 1_000 seconds
        expect(estimateWaitSecs(config, s, 1_000_000n, 0n)).toBe(1_000n);
    });

    it("uses ceiling division for fractional seconds", () => {
        const s = state();
        // Need 1_001 sats, refill rate 1_000/sec → ceil(1_001/1_000) = 2 seconds
        expect(estimateWaitSecs(config, s, 1_001n, 0n)).toBe(2n);
    });

    it("accounts for partial refill via elapsed time", () => {
        const s = state({ lastUpdatedAtSecs: 0n });
        // At nowSecs=500, available = 500_000. Need 600_000. Deficit = 100_000.
        // Wait = 100_000 / 1_000 = 100 seconds.
        expect(estimateWaitSecs(config, s, 600_000n, 500n)).toBe(100n);
    });

    it("returns null when refill rate is zero and deficit exists", () => {
        const zeroConfig = { ...config, refillRateSatsPerSec: 0n };
        const s = state({ numTokensAvailableSats: 100n });
        expect(estimateWaitSecs(zeroConfig, s, 200n, 0n)).toBeNull();
    });

    it("returns 0n when exact amount is available", () => {
        const s = state({ numTokensAvailableSats: 1_000_000n });
        expect(estimateWaitSecs(config, s, 1_000_000n, 0n)).toBe(0n);
    });

    it("returns 0n when refill at nowSecs makes amount exactly available", () => {
        const s = state({ lastUpdatedAtSecs: 0n });
        // At nowSecs=100, available = 100_000
        expect(estimateWaitSecs(config, s, 100_000n, 100n)).toBe(0n);
    });
});
