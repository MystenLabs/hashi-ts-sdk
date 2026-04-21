import { Value } from "./contracts/hashi/config_value.js";
import { HashiConfigError, InvalidDepositParamsError } from "./errors.js";

export type ConfigValue = typeof Value.$inferType;
export type ConfigEntry = { key: string; value: ConfigValue };

/** 0x-prefixed 32-byte hex (66 chars). Matches Sui addresses and Bitcoin txids. */
const HEX32_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Guards that `value` is a 0x-prefixed 32-byte hex string, throwing
 * `InvalidDepositParamsError` otherwise. `fieldName` is interpolated into
 * the error message so callers can tell which deposit parameter failed.
 */
export function assertHex32(value: unknown, fieldName: string): void {
    if (typeof value !== "string" || !HEX32_RE.test(value)) {
        throw new InvalidDepositParamsError({
            reason: `\`${fieldName}\` must be a 0x-prefixed 32-byte hex string`,
            detail: `got ${JSON.stringify(value)}`,
        });
    }
}

/**
 * Find a VecMap entry by key and narrow its `Value` variant. Discriminating
 * on `$kind` lets TypeScript narrow the returned payload — callers get the
 * variant-specific fields (e.g. `.U64: string`, `.Bool: boolean`) without
 * any manual type assertions.
 */
export function entry<K extends ConfigValue["$kind"]>(
    contents: readonly ConfigEntry[],
    key: string,
    expectedVariant: K,
): Extract<ConfigValue, { $kind: K }> {
    const e = contents.find((c) => c.key === key);
    if (!e) throw HashiConfigError.missing(key, expectedVariant);
    if (e.value.$kind !== expectedVariant) {
        throw HashiConfigError.wrongVariant(key, expectedVariant, e.value.$kind);
    }
    return e.value as Extract<ConfigValue, { $kind: K }>;
}
