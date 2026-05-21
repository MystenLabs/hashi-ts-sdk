import { HashiFetchError } from "./errors.js";
import type {
    GuardianLimiterConfig,
    GuardianLimiterState,
    RawGuardianInfo,
} from "./types.js";

export function projectCapacity(
    config: GuardianLimiterConfig,
    state: GuardianLimiterState,
    timestampSecs: bigint,
): bigint {
    const elapsed =
        timestampSecs > state.lastUpdatedAtSecs
            ? timestampSecs - state.lastUpdatedAtSecs
            : 0n;
    const refilled = elapsed * config.refillRateSatsPerSec;
    const projected = state.numTokensAvailableSats + refilled;
    return projected < config.maxBucketCapacitySats
        ? projected
        : config.maxBucketCapacitySats;
}

export function estimateWaitSecs(
    config: GuardianLimiterConfig,
    state: GuardianLimiterState,
    amountSats: bigint,
    nowSecs: bigint,
): bigint | null {
    if (amountSats > config.maxBucketCapacitySats) return null;
    const available = projectCapacity(config, state, nowSecs);
    if (available >= amountSats) return 0n;
    const deficit = amountSats - available;
    if (config.refillRateSatsPerSec === 0n) return null;
    return (deficit + config.refillRateSatsPerSec - 1n) / config.refillRateSatsPerSec;
}

export async function fetchGuardianInfo(url: string): Promise<RawGuardianInfo> {
    const endpoint = `${url}/sui.hashi.v1alpha.GuardianService/GetGuardianInfo`;
    let res: Response;
    try {
        res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
    } catch (cause) {
        throw new HashiFetchError(
            `Guardian endpoint unreachable: ${endpoint}`,
            url,
            { cause },
        );
    }
    if (!res.ok) {
        throw new HashiFetchError(
            `Guardian GetGuardianInfo failed: HTTP ${res.status}`,
            url,
        );
    }
    const body = (await res.json()) as {
        limiterState?: {
            numTokensAvailableSats?: string;
            lastUpdatedAtSecs?: string;
            nextSeq?: string;
        };
        limiterConfig?: {
            refillRateSatsPerSec?: string;
            maxBucketCapacitySats?: string;
        };
    };
    return {
        limiterState: {
            numTokensAvailableSats: BigInt(body.limiterState?.numTokensAvailableSats ?? "0"),
            lastUpdatedAtSecs: BigInt(body.limiterState?.lastUpdatedAtSecs ?? "0"),
            nextSeq: BigInt(body.limiterState?.nextSeq ?? "0"),
        },
        limiterConfig: {
            refillRateSatsPerSec: BigInt(body.limiterConfig?.refillRateSatsPerSec ?? "0"),
            maxBucketCapacitySats: BigInt(body.limiterConfig?.maxBucketCapacitySats ?? "0"),
        },
    };
}
