import { describe, it, expect } from "vitest";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { hashi } from "../../src/client.js";
import { NETWORK_CONFIG } from "../../src/constants.js";

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
 * Set `HASHI_E2E_WAIT_FOR_HBTC=1` to additionally poll the recipient's hBTC
 * balance after submission and assert that the committee mints. Off by
 * default because committee latency varies (8 min – 1.5 h on devnet) and the
 * extra wait would dominate routine runs. On — locks in that Move event
 * emission also implies on-chain hBTC arrival, which is the post-condition
 * SEDEFI-190 (txid byte-order bug) silently violated for weeks.
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

const RPC_URL = "https://fullnode.devnet.sui.io:443";
const HBTC_POLL_INTERVAL_MS = 30_000;
const HBTC_POLL_TIMEOUT_MS = 15 * 60_000;

/**
 * Read the recipient's hBTC balance via the JSON-RPC fallback on the gRPC
 * endpoint — keeps this test free of the codegen-typed coin queries and
 * avoids dragging the full client into a polling loop.
 */
async function fetchHBtcBalance(recipient: string, btcCoinType: string): Promise<bigint> {
    const resp = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "suix_getBalance",
            params: [recipient, btcCoinType],
        }),
    });
    const data = (await resp.json()) as { result?: { totalBalance?: string } };
    return BigInt(data.result?.totalBalance ?? "0");
}

describe("HashiClient.deposit (signet + devnet, real network)", () => {
    const waitForHBtc = process.env.HASHI_E2E_WAIT_FOR_HBTC === "1";
    const testTimeoutMs = waitForHBtc ? HBTC_POLL_TIMEOUT_MS + 60_000 : 120_000;

    it(
        "submits a real deposit for the configured signet UTXO and emits DepositRequestedEvent",
        async () => {
            const signer = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(TEST_PK).secretKey);
            const recipient = signer.toSuiAddress();
            const amountSats = BigInt(TEST_AMOUNT_SATS);

            const client = new SuiGrpcClient({
                network: "devnet",
                baseUrl: RPC_URL,
            }).$extend(hashi({ network: "devnet" }));

            const btcCoinType = `${NETWORK_CONFIG.devnet!.packageId}::btc::BTC`;
            // Snapshot pre-deposit hBTC so a re-run on a previously-funded
            // address still gates on a real *increase*, not absolute balance.
            const balanceBefore = waitForHBtc ? await fetchHBtcBalance(recipient, btcCoinType) : 0n;

            const result = await client.hashi.deposit({
                signer,
                txid: `0x${TEST_TXID}`,
                utxos: [{ vout: Number(TEST_VOUT), amountSats }],
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

            if (!waitForHBtc) return;

            const target = balanceBefore + amountSats;
            const deadline = Date.now() + HBTC_POLL_TIMEOUT_MS;
            // eslint-disable-next-line no-console
            console.log(
                `[deposit.test] waiting for hBTC at ${recipient}: ` +
                    `before=${balanceBefore}, target=${target}, ` +
                    `timeout=${HBTC_POLL_TIMEOUT_MS / 60_000} min`,
            );
            for (;;) {
                const current = await fetchHBtcBalance(recipient, btcCoinType);
                if (current >= target) {
                    // eslint-disable-next-line no-console
                    console.log(`[deposit.test] hBTC arrived: balance=${current}`);
                    expect(current).toBeGreaterThanOrEqual(target);
                    return;
                }
                if (Date.now() >= deadline) {
                    throw new Error(
                        `hBTC did not arrive within ${HBTC_POLL_TIMEOUT_MS / 60_000} min — ` +
                            `recipient=${recipient}, before=${balanceBefore}, ` +
                            `target=${target}, last=${current}. ` +
                            `Most likely the committee couldn't verify the deposit ` +
                            `(check txid byte-order, BTC confirmations, or committee health).`,
                    );
                }
                await new Promise((resolve) => setTimeout(resolve, HBTC_POLL_INTERVAL_MS));
            }
        },
        testTimeoutMs,
    );
});
