/**
 * Custom error classes thrown by the Hashi SDK. Consumers can `instanceof`-check
 * these to distinguish SDK-structured failures (missing/malformed on-chain data,
 * chain-fetch failures) from generic runtime errors.
 */

/**
 * Thrown when a governance config entry on-chain is missing, has an unexpected
 * variant, or has a payload that cannot be decoded to the expected type.
 * Carries the offending `key` and `expectedVariant` as structured fields so
 * callers can react programmatically without string-parsing the message.
 */
export class HashiConfigError extends Error {
    readonly key: string;
    readonly expectedVariant: string;
    readonly actualVariant?: string;

    constructor(
        message: string,
        details: { key: string; expectedVariant: string; actualVariant?: string },
        options?: { cause?: unknown },
    ) {
        super(message, options);
        this.name = "HashiConfigError";
        this.key = details.key;
        this.expectedVariant = details.expectedVariant;
        this.actualVariant = details.actualVariant;
    }

    static missing(key: string, expectedVariant: string): HashiConfigError {
        return new HashiConfigError(`Config key "${key}" not found on-chain.`, {
            key,
            expectedVariant,
        });
    }

    static wrongVariant(
        key: string,
        expectedVariant: string,
        actualVariant: string,
    ): HashiConfigError {
        return new HashiConfigError(
            `Config key "${key}" is ${actualVariant}, expected ${expectedVariant}.`,
            { key, expectedVariant, actualVariant },
        );
    }

    static malformedPayload(
        key: string,
        expectedVariant: string,
        detail: string,
        cause?: unknown,
    ): HashiConfigError {
        return new HashiConfigError(
            `Config key "${key}" ${expectedVariant} payload is malformed: ${detail}.`,
            { key, expectedVariant, actualVariant: expectedVariant },
            { cause },
        );
    }
}

/**
 * Thrown when fetching the Hashi shared object fails or returns an
 * unexpectedly shaped response. Wraps the underlying Sui-client error via
 * `cause` so callers can still access the network-layer detail.
 */
export class HashiFetchError extends Error {
    readonly hashiObjectId: string;

    constructor(message: string, hashiObjectId: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "HashiFetchError";
        this.hashiObjectId = hashiObjectId;
    }
}

/** One UTXO that failed the client-side deposit-minimum check. */
export interface AmountViolation {
    readonly amount: bigint;
    readonly minimum: bigint;
    readonly vout: number;
}

/**
 * Thrown by `HashiClient.deposit()` when one or more UTXOs are below the live
 * on-chain deposit minimum. Carries every offending UTXO so callers can fix
 * all violations in one round-trip rather than retrying N times. Raised after
 * the governance snapshot is fetched but before any PTB is built — mirrors
 * the Move-side `EBelowMinimumDeposit` abort in `deposit::deposit`.
 */
export class AmountBelowMinimumError extends Error {
    readonly violations: readonly AmountViolation[];

    constructor(details: { violations: readonly AmountViolation[] }) {
        const { violations } = details;
        const head = violations[0];
        const summary =
            violations.length === 1
                ? `UTXO at vout ${head.vout} has amount ${head.amount} sats, ` +
                  `below the protocol minimum of ${head.minimum} sats.`
                : `${violations.length} UTXOs are below the protocol minimum ` +
                  `(${head.minimum} sats): ${violations
                      .map((v) => `vout ${v.vout} = ${v.amount} sats`)
                      .join(", ")}.`;
        super(summary);
        this.name = "AmountBelowMinimumError";
        this.violations = violations;
    }
}

/**
 * Thrown by user-facing entry points when `paused` is `true` in the governance
 * config snapshot. Mirrors the Move-side `ESystemPaused` abort in
 * `hashi::assert_unpaused` so the SDK can fail early with a typed error
 * instead of a gas-burning on-chain abort.
 */
export class HashiPausedError extends Error {
    readonly operation?: string;

    constructor(details?: { operation?: string }, options?: { cause?: unknown }) {
        const op = details?.operation;
        super(
            op
                ? `Hashi protocol is currently paused; cannot ${op}.`
                : "Hashi protocol is currently paused.",
            options,
        );
        this.name = "HashiPausedError";
        this.operation = op;
    }
}

/**
 * Thrown by `HashiClient.deposit()` when the caller-supplied `DepositParams`
 * don't meet the structural preconditions (empty `utxos`, duplicate `vout`
 * within a txid, malformed `txid` or `recipient`). Raised before any chain
 * read so even a paused or unreachable protocol surfaces the client-side
 * bug first.
 */
export class InvalidDepositParamsError extends Error {
    readonly reason: string;
    readonly detail?: string;

    constructor(details: { reason: string; detail?: string }, options?: { cause?: unknown }) {
        super(details.detail ? `${details.reason}: ${details.detail}` : details.reason, options);
        this.name = "InvalidDepositParamsError";
        this.reason = details.reason;
        this.detail = details.detail;
    }
}
