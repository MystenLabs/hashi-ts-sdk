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
