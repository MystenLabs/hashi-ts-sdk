import { test, expect } from "vitest";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { hashi } from "../../src/client.js";

/**
 * Dev tool — phase 2 of the withdrawal e2e. Cancels a previously-requested
 * withdrawal and asserts `WithdrawalCancelledEvent`. Companion to
 * `_request-withdrawal.test.ts`.
 *
 * Prerequisites:
 *
 *   1. `HASHI_E2E_WITHDRAWAL_REQUEST_ID` is set to the `request_id` emitted
 *      by the phase-1 test.
 *   2. `withdrawal_cancellation_cooldown_ms` has elapsed since the request
 *      was made. On-chain abort `ECooldownNotElapsed` otherwise.
 *   3. The committee has NOT yet committed the request to a withdrawal
 *      transaction — it must still be `Requested` or `Approved`. On-chain
 *      abort `ECannotCancelProcessingWithdrawal` otherwise.
 *   4. `HASHI_E2E_SUI_PRIVATE_KEY` matches the signer that created the
 *      original request (Move enforces original-requester-only).
 *
 * Run: `pnpm test:integration -t "cancel withdrawal"`
 */

const TEST_PK = process.env.HASHI_E2E_SUI_PRIVATE_KEY;
const REQUEST_ID = process.env.HASHI_E2E_WITHDRAWAL_REQUEST_ID;
if (!TEST_PK || !REQUEST_ID) {
    throw new Error(
        "Set HASHI_E2E_SUI_PRIVATE_KEY and HASHI_E2E_WITHDRAWAL_REQUEST_ID " +
            "in `.env` before running this test.",
    );
}

test("cancel withdrawal", async () => {
    const signer = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(TEST_PK).secretKey);
    const client = new SuiGrpcClient({
        network: "devnet",
        baseUrl: "https://fullnode.devnet.sui.io:443",
    }).$extend(hashi({ network: "devnet" }));

    const result = await client.hashi.cancelWithdrawal({
        signer,
        requestId: REQUEST_ID,
    });

    expect(result.$kind).toBe("Transaction");
    if (result.$kind !== "Transaction") {
        throw new Error(`Transaction failed: ${JSON.stringify(result.FailedTransaction)}`);
    }
    expect(result.Transaction.status.success).toBe(true);

    const evt = result.Transaction.events?.find((e) =>
        e.eventType.endsWith("::withdrawal_queue::WithdrawalCancelledEvent"),
    );
    expect(evt).toBeDefined();

    const parsed = (
        evt as unknown as {
            parsedJson?: {
                request_id?: string;
                requester_address?: string;
                btc_amount?: string;
            };
        }
    ).parsedJson;
    if (parsed?.request_id && parsed.btc_amount) {
        console.log(`cancelled request_id=${parsed.request_id} amount=${parsed.btc_amount} sats`);
    } else {
        console.log("WithdrawalCancelledEvent:", evt);
    }
}, 120_000);
