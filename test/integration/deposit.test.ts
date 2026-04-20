import { describe, it, expect } from "vitest";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { hashi } from "../../src/client.js";

/**
 * Real-network deposit smoke test — BTC signet funding + Sui devnet submission.
 *
 * Gated by `HASHI_E2E_SUI_PRIVATE_KEY` (a suiprivkey1…-encoded Ed25519 key)
 * so `pnpm test:integration` stays green in CI when the secret isn't set. To
 * run locally:
 *
 *   1. Derive the BTC deposit address for your Sui address and fund it on
 *      signet via https://signetfaucet.com/.
 *   2. Wait for the tx to confirm (≈10 min per signet block).
 *   3. `HASHI_E2E_SUI_PRIVATE_KEY=suiprivkey1… pnpm test:integration`
 *
 * The test stops at `DepositRequestedEvent`. The committee-driven
 * `DepositConfirmedEvent` can take 1+ hour after 6 signet confirmations and
 * is out of scope here — waiting for it belongs to a future `waitForDeposit`
 * helper.
 */
// Fail loudly at module load if the env var is missing — otherwise vitest
// reports "0 failed" and exits 0 (it.skip ran, test file was considered
// successful), which previously masked a .env that wasn't being picked up.
const TEST_PK = process.env.HASHI_E2E_SUI_PRIVATE_KEY;
if (!TEST_PK) {
    throw new Error(
        "HASHI_E2E_SUI_PRIVATE_KEY is not set. Add it to a `.env` file at the " +
            "project root (e.g. `HASHI_E2E_SUI_PRIVATE_KEY=suiprivkey1...`) or " +
            "export it in your shell before running `pnpm test:integration`.",
    );
}

describe("HashiClient.deposit (signet + devnet, real network)", () => {
    it(
        "submits a real deposit for an existing signet UTXO and emits DepositRequestedEvent",
        async () => {
            const kp = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(TEST_PK).secretKey);
            const recipient = kp.toSuiAddress();

            const client = new SuiGrpcClient({
                network: "devnet",
                baseUrl: "https://fullnode.devnet.sui.io:443",
            }).$extend(hashi({ network: "devnet" }));

            const btcAddress = await client.hashi.generateDepositAddress({
                suiAddress: recipient,
            });

            const res = await fetch(`https://mempool.space/signet/api/address/${btcAddress}/utxo`);
            if (!res.ok) {
                throw new Error(
                    `mempool.space lookup failed for ${btcAddress}: ${res.status} ${res.statusText}`,
                );
            }
            const utxos = (await res.json()) as Array<{
                txid: string;
                vout: number;
                value: number;
            }>;
            if (utxos.length === 0) {
                throw new Error(
                    `Signet address ${btcAddress} has no UTXOs. Top it up at ` +
                        `https://signetfaucet.com/ and re-run.`,
                );
            }

            const u = utxos[0];
            const tx = await client.hashi.deposit({
                txid: `0x${u.txid}`,
                utxos: [{ vout: u.vout, amountSats: BigInt(u.value) }],
                recipient,
            });

            const result = await client.signAndExecuteTransaction({
                signer: kp,
                transaction: tx,
                include: { effects: true, events: true },
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
        },
        120_000,
    );
});
