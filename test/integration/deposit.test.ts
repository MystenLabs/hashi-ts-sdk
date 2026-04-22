import { describe, it, expect } from "vitest";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { hashi } from "../../src/client.js";

/**
 * Real-network deposit smoke test — Sui devnet submission against an
 * already-funded signet UTXO.
 *
 * UTXO details are supplied via env vars so the test has no live
 * mempool.space dependency. To run locally:
 *
 *   1. Derive the BTC deposit address for your Sui address and fund it on
 *      signet. Wait for the tx to confirm (≈10 min per block).
 *   2. Populate `.env` at the project root:
 *        HASHI_E2E_SUI_PRIVATE_KEY=suiprivkey1…
 *        HASHI_E2E_BTC_TXID=<64-char hex, no 0x prefix>
 *        HASHI_E2E_BTC_VOUT=<integer>
 *        HASHI_E2E_BTC_AMOUNT_SATS=<integer>
 *   3. `pnpm test:integration`
 *
 * The test stops at `DepositRequestedEvent`. The committee-driven
 * `DepositConfirmedEvent` can take 1+ hour after 6 signet confirmations and
 * is out of scope here — waiting for it belongs to a future `waitForDeposit`
 * helper.
 */
// Fail loudly at module load if any env var is missing — otherwise vitest
// reports "0 failed" and exits 0, which previously masked a .env that wasn't
// being picked up.
const TEST_PK = process.env.HASHI_E2E_SUI_PRIVATE_KEY;
const TEST_TXID = process.env.HASHI_E2E_BTC_TXID;
const TEST_VOUT = process.env.HASHI_E2E_BTC_VOUT;
const TEST_AMOUNT_SATS = process.env.HASHI_E2E_BTC_AMOUNT_SATS;
if (!TEST_PK || !TEST_TXID || !TEST_VOUT || !TEST_AMOUNT_SATS) {
    throw new Error(
        "Set HASHI_E2E_SUI_PRIVATE_KEY, HASHI_E2E_BTC_TXID, HASHI_E2E_BTC_VOUT, " +
            "and HASHI_E2E_BTC_AMOUNT_SATS in `.env` at the project root (or " +
            "export them) before running `pnpm test:integration`.",
    );
}

describe("HashiClient.deposit (signet + devnet, real network)", () => {
    it("submits a real deposit for the configured signet UTXO and emits DepositRequestedEvent", async () => {
        const signer = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(TEST_PK).secretKey);
        const recipient = signer.toSuiAddress();

        const client = new SuiGrpcClient({
            network: "devnet",
            baseUrl: "https://fullnode.devnet.sui.io:443",
        }).$extend(hashi({ network: "devnet" }));

        const result = await client.hashi.deposit({
            signer,
            txid: `0x${TEST_TXID}`,
            utxos: [{ vout: Number(TEST_VOUT), amountSats: BigInt(TEST_AMOUNT_SATS) }],
            recipient,
        });

        // Discriminated union — a failed execution lands under FailedTransaction.
        expect(result.$kind).toBe("Transaction");
        if (result.$kind !== "Transaction") {
            throw new Error(`Transaction failed: ${JSON.stringify(result.FailedTransaction)}`);
        }
        expect(result.Transaction.status.success).toBe(true);

        const evt = result.Transaction.events?.find((e) =>
            e.eventType.endsWith("::deposit::DepositRequestedEvent"),
        );
        expect(evt).toBeDefined();
    }, 120_000);
});
