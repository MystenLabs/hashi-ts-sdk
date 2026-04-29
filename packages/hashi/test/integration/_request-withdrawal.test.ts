import { test, expect } from "vitest";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { hashi } from "../../src/client.js";

/**
 * Dev tool — phase 1 of the withdrawal e2e. Submits a real withdrawal request
 * against Sui devnet and logs the emitted `request_id` so the companion
 * `_cancel-withdrawal.test.ts` can consume it.
 *
 * Prerequisites:
 *
 *   1. Signer owns enough `Coin<BTC>` on Sui. This requires a prior deposit
 *      that the MPC committee has confirmed — there is no shortcut (see
 *      `_request-withdrawal`'s limitations note in the README once it lands).
 *   2. `.env` at the project root contains:
 *        HASHI_E2E_SUI_PRIVATE_KEY=suiprivkey1…
 *        HASHI_E2E_BTC_RECIPIENT=<signet bech32/bech32m address, tb1q… or tb1p…>
 *        HASHI_E2E_WITHDRAW_SATS=<integer ≥ bitcoin_withdrawal_minimum>
 *
 *   3. `pnpm test:integration -t "request withdrawal"`
 *
 * The test stops at `WithdrawalRequestedEvent`. The committee-driven
 * approve → commit → sign → confirm → BTC-delivered flow is out of scope,
 * same as the deposit e2e stopping at `DepositRequestedEvent`.
 */

const TEST_PK = process.env.HASHI_E2E_SUI_PRIVATE_KEY;
const RECIPIENT = process.env.HASHI_E2E_BTC_RECIPIENT;
const AMOUNT = process.env.HASHI_E2E_WITHDRAW_SATS;
if (!TEST_PK || !RECIPIENT || !AMOUNT) {
    throw new Error(
        "Set HASHI_E2E_SUI_PRIVATE_KEY, HASHI_E2E_BTC_RECIPIENT, and " +
            "HASHI_E2E_WITHDRAW_SATS in `.env` before running this test.",
    );
}

test("request withdrawal", async () => {
    const signer = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(TEST_PK).secretKey);
    const client = new SuiGrpcClient({
        network: "devnet",
        baseUrl: "https://fullnode.devnet.sui.io:443",
    }).$extend(hashi({ network: "devnet" }));

    // Log the cancellation cooldown up front so the operator knows how long
    // they'll need to wait before `_cancel-withdrawal.test.ts` can succeed.
    const cooldownMs = await client.hashi.view.withdrawalCancellationCooldownMs();
    console.log(`withdrawalCancellationCooldownMs = ${cooldownMs}`);

    const result = await client.hashi.requestWithdrawal({
        signer,
        amountSats: BigInt(AMOUNT),
        bitcoinAddress: RECIPIENT,
    });

    expect(result.$kind).toBe("Transaction");
    if (result.$kind !== "Transaction") {
        throw new Error(`Transaction failed: ${JSON.stringify(result.FailedTransaction)}`);
    }
    expect(result.Transaction.status.success).toBe(true);

    const evt = result.Transaction.events?.find((e) =>
        e.eventType.endsWith("::withdrawal_queue::WithdrawalRequestedEvent"),
    );
    expect(evt).toBeDefined();

    // Try to surface the request_id for the follow-up cancel test. The exact
    // event-body field name varies by client transport; fall back to dumping
    // the whole event so the operator can copy it by hand.
    const parsed = (evt as unknown as { parsedJson?: { request_id?: string } }).parsedJson;
    const requestId = parsed?.request_id;
    if (requestId) {
        console.log(`request_id = ${requestId}`);
        console.log(`Next: export HASHI_E2E_WITHDRAWAL_REQUEST_ID=${requestId}`);
        console.log(`Then wait ≥ ${cooldownMs} ms before running _cancel-withdrawal.`);
    } else {
        console.log("WithdrawalRequestedEvent (copy request_id manually):", evt);
    }
}, 120_000);
