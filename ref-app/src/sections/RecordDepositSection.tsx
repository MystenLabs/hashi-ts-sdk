import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import type { DepositStatus } from "@mysten-incubation/hashi";
import { useHashiClient } from "../lib/hashi.ts";
import { useDepositStatus } from "../lib/poll.ts";
import { useActivity } from "../lib/activity.tsx";
import { BITCOIN_NETWORK } from "../lib/deployment.ts";
import { fetchAddressUtxos, mempoolBase, pickFundingGroup } from "../lib/mempool.ts";
import { sats, whenMs, untilMs, elapsed, describeError, isHex32 } from "../lib/format.ts";

type Row = { id: string; vout: string; amountSats: string };
const newRow = (vout = ""): Row => ({ id: crypto.randomUUID(), vout, amountSats: "" });

/** Pull the digest out of the dapp-kit execution result (which carries no events). */
function extractDigest(res: unknown): string | undefined {
    if (!res || typeof res !== "object") return undefined;
    const root: any = res;
    if (root.$kind === "FailedTransaction") {
        throw new Error(`Transaction failed: ${JSON.stringify(root.FailedTransaction)}`);
    }
    if (root.$kind === "Transaction" && root.Transaction) return root.Transaction.digest;
    return root.digest;
}

export function RecordDepositSection() {
    const account = useCurrentAccount();
    const dAppKit = useDAppKit();
    const hashiClient = useHashiClient();
    const { push } = useActivity();

    const [txid, setTxid] = useState("0x");
    const [recipient, setRecipient] = useState("");
    const [rows, setRows] = useState<Row[]>(() => [newRow("0")]);
    const [digest, setDigest] = useState<string | null>(null);

    // dev-wallet autoConnect resolves asynchronously after mount; pre-fill the
    // recipient with the connected address once it's known (only while empty).
    useEffect(() => {
        if (account?.address) setRecipient((prev) => prev || account.address);
    }, [account?.address]);

    const filledRows = rows.filter((r) => r.vout.trim() !== "");

    const usageCheck = useMutation({
        mutationFn: () =>
            hashiClient.hashi.view.findUsedUtxos(
                filledRows.map((r) => ({ txid, vout: Number(r.vout) })),
            ),
    });

    // Reuse §3's derived deposit address (same query key → shared cache, reflects
    // §3's guardian-unprovisioned state without re-deriving here).
    const { data: depositAddr } = useQuery({
        queryKey: ["hashi", "depositAddr", account?.address],
        enabled: !!account?.address,
        retry: false,
        queryFn: () => hashiClient.hashi.generateDepositAddress({ suiAddress: account!.address }),
    });

    // Look up the deposit address's UTXOs on mempool.space and fill the form with
    // one funding tx (display-order txid + a row per vout). The user reviews, then
    // submits — see 2026-06-18-ref-app-autofill-deposit-utxos-design.md.
    const autofill = useMutation({
        mutationFn: async () => {
            const utxos = await fetchAddressUtxos(BITCOIN_NETWORK, depositAddr!);
            return utxos.length === 0 ? { group: null, otherTxCount: 0 } : pickFundingGroup(utxos);
        },
        onSuccess: ({ group }) => {
            if (!group) return;
            setTxid(`0x${group.txid}`);
            setRows(
                group.utxos.map((u) => ({
                    id: crypto.randomUUID(),
                    vout: String(u.vout),
                    amountSats: String(u.value),
                })),
            );
            setRecipient((prev) => prev || account?.address || "");
        },
    });

    const mutation = useMutation({
        mutationFn: async () => {
            const utxos = filledRows.map((r) => ({
                vout: Number(r.vout),
                amountSats: BigInt(r.amountSats || "0"),
            }));
            const transaction = hashiClient.hashi.tx.deposit({ txid, utxos, recipient });
            const res = await dAppKit.signAndExecuteTransaction({ transaction });
            return { digest: extractDigest(res) };
        },
        onSuccess: (r) => {
            setDigest(r.digest ?? null);
            push({ kind: "deposit", status: "success", digest: r.digest });
        },
        onError: (err) => {
            setDigest(null);
            push({ kind: "deposit", status: "failed", error: describeError(err) });
        },
    });

    const txidValid = isHex32(txid);
    const recipientValid = isHex32(recipient);
    const canCheck = txidValid && filledRows.length > 0 && !usageCheck.isPending;
    const canSubmit =
        !!account && txidValid && recipientValid && filledRows.length > 0 && !mutation.isPending;

    // Native-tooltip text explaining what the auto-fill button does — shows the
    // exact mempool.space REST call (the `curl` equivalent) once the §3 address
    // has resolved, so the lookup isn't a black box.
    const autofillBase = mempoolBase(BITCOIN_NETWORK);
    const autofillHint =
        depositAddr && autofillBase
            ? `Looks up the UTXOs paying your §3 deposit address on mempool.space and fills the txid, vout(s) and amounts for one funding tx. Equivalent to:\n\ncurl ${autofillBase}/address/${depositAddr}/utxo`
            : "Looks up the UTXOs paying your §3 deposit address on mempool.space and fills the form. Derive your address in §3 first.";

    const update = (id: string, field: "vout" | "amountSats", value: string) =>
        setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    const addRow = () => setRows([...rows, newRow()]);
    const removeRow = (id: string) => setRows(rows.filter((r) => r.id !== id));

    return (
        <section className="section">
            <h2>
                <span className="num">4</span> Record a deposit
            </h2>
            <p className="calls">
                Calls <code>{`client.hashi.tx.deposit({ txid, utxos, recipient })`}</code> then
                signs via the connected wallet.
            </p>

            <div className="row" style={{ marginBottom: "0.75rem" }}>
                <span className="tip">
                    <button
                        type="button"
                        onClick={() => autofill.mutate()}
                        disabled={!depositAddr || autofill.isPending}
                    >
                        {autofill.isPending ? "Looking up…" : "Auto-fill from deposit address"}
                    </button>
                    <span className="tip-body mono">{autofillHint}</span>
                </span>
                {!depositAddr && (
                    <span className="muted small">Derive your address in §3 first.</span>
                )}
            </div>
            {autofill.error && (
                <p className="err mono" style={{ marginTop: "-0.25rem" }}>
                    {describeError(autofill.error)}
                </p>
            )}
            {autofill.data && !autofill.data.group && (
                <p className="muted small" style={{ marginTop: "-0.25rem" }}>
                    No funds at your deposit address yet — fund it via §3 and wait for it to appear.
                </p>
            )}
            {autofill.data?.group && (
                <p className="muted small" style={{ marginTop: "-0.25rem" }}>
                    Filled from tx <code>{autofill.data.group.txid.slice(0, 12)}…</code>{" "}
                    <span
                        className={`badge ${autofill.data.group.confirmed ? "badge-ok" : "badge-pending"}`}
                    >
                        {autofill.data.group.confirmed ? "confirmed" : "pending confirmation"}
                    </span>
                    {autofill.data.otherTxCount > 0 &&
                        ` — ${autofill.data.otherTxCount} other funding tx${
                            autofill.data.otherTxCount > 1 ? "s" : ""
                        } found; submit this one, then re-fetch for the rest.`}
                </p>
            )}

            <label>Funding txid (display order, 0x-prefixed):</label>
            <input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="0x…" />

            <label>UTXOs paying the deposit address:</label>
            {rows.map((r) => (
                <div className="row" key={r.id} style={{ marginTop: "0.4rem" }}>
                    <input
                        style={{ maxWidth: "120px" }}
                        value={r.vout}
                        onChange={(e) => update(r.id, "vout", e.target.value)}
                        placeholder="vout"
                    />
                    <input
                        value={r.amountSats}
                        onChange={(e) => update(r.id, "amountSats", e.target.value)}
                        placeholder="amountSats"
                    />
                    {rows.length > 1 && (
                        <button onClick={() => removeRow(r.id)} type="button">
                            ×
                        </button>
                    )}
                </div>
            ))}
            <div className="row" style={{ marginTop: "0.4rem" }}>
                <button onClick={addRow} type="button">
                    + Add output
                </button>
                <button onClick={() => usageCheck.mutate()} type="button" disabled={!canCheck}>
                    {usageCheck.isPending ? "Checking…" : "Check if UTXOs already used"}
                </button>
            </div>

            {usageCheck.error && (
                <p className="err mono" style={{ marginTop: "0.5rem" }}>
                    {describeError(usageCheck.error)}
                </p>
            )}
            {usageCheck.data && (
                <div className="subpanel">
                    <h3>
                        UTXO usage — <code>view.findUsedUtxos()</code>
                    </h3>
                    {usageCheck.data.length === 0 ? (
                        <p className="muted">No vouts to check.</p>
                    ) : (
                        <ul className="mono small" style={{ margin: 0, paddingLeft: "1rem" }}>
                            {usageCheck.data.map((u, i) => (
                                <li key={i}>
                                    vout {u.utxoId.vout}:{" "}
                                    <span
                                        className={`badge ${u.isUsed ? "badge-err" : "badge-ok"}`}
                                    >
                                        {u.isUsed ? (u.inSpentPool ? "spent" : "active") : "unused"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <label>Recipient Sui address:</label>
            <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x…"
            />

            <div className="row" style={{ marginTop: "1rem" }}>
                <button className="primary" onClick={() => mutation.mutate()} disabled={!canSubmit}>
                    {mutation.isPending ? "Submitting…" : "Submit deposit"}
                </button>
                {account && !recipientValid && (
                    <span className="muted small">Enter a 0x-prefixed 32-byte Sui address.</span>
                )}
            </div>

            {mutation.error && (
                <p className="err mono" style={{ marginTop: "0.5rem" }}>
                    {describeError(mutation.error)}
                </p>
            )}
            {digest && (
                <div style={{ marginTop: "1rem" }}>
                    <p className="mono">
                        digest:{" "}
                        <a
                            href={`https://suiscan.xyz/devnet/tx/${digest}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {digest}
                        </a>
                    </p>
                    <DepositStatusTracker digest={digest} />
                </div>
            )}
        </section>
    );
}

function depositBadge(status?: DepositStatus): string {
    switch (status) {
        case "confirmed":
            return "badge-ok";
        case "pending":
            return "badge-pending";
        case "expired":
            return "badge-err";
        default:
            return "badge-info";
    }
}

function DepositStatusTracker({ digest }: { digest: string }) {
    const { data, error, isFetching, refetch } = useDepositStatus(digest);
    const [now, setNow] = useState(() => Date.now());
    // When this tracker first appeared (deposit just recorded) — the baseline for
    // the "waiting" elapsed timer.
    const [startedAt] = useState(() => Date.now());

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    // Keep counting until the deposit reaches a terminal state. `confirmableAtMs`
    // (when present) gives a real ETA; otherwise we show elapsed wait time.
    const waiting = data == null || (data.status !== "confirmed" && data.status !== "expired");

    return (
        <div className="subpanel">
            <h3>Deposit status</h3>
            <p className="calls">
                Polls <code>client.hashi.view.depositStatus(digest)</code> (imperative equivalent:{" "}
                <code>waitForDeposit</code>). The DepositRequestedEvent is parsed server-side by the
                SDK.
            </p>
            <div className="row">
                <span className={`badge ${depositBadge(data?.status)}`}>
                    {data?.status ?? (isFetching ? "…" : "unknown")}
                </span>
                {waiting && (
                    <span className="muted small" title="Time spent waiting for confirmation">
                        ⏳{" "}
                        {data?.confirmableAtMs != null
                            ? `confirmable ${untilMs(data.confirmableAtMs, now)}`
                            : `waiting ${elapsed(now - startedAt)}`}
                    </span>
                )}
                <button onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? "Refreshing…" : "Refresh"}
                </button>
            </div>
            {error && <p className="err">{describeError(error)}</p>}
            {data && (
                <dl className="kv" style={{ marginTop: "0.75rem" }}>
                    <dt>requestId</dt>
                    <dd>{data.requestId}</dd>
                    <dt>amount</dt>
                    <dd>{sats(data.amountSats)}</dd>
                    <dt>btc outpoint</dt>
                    <dd>
                        {data.btcTxid}:{data.btcVout}
                    </dd>
                    <dt>approvalTimestampMs</dt>
                    <dd>
                        {data.approvalTimestampMs != null ? whenMs(data.approvalTimestampMs) : "—"}
                    </dd>
                    <dt>confirmableAtMs</dt>
                    <dd>
                        {data.confirmableAtMs != null
                            ? `${whenMs(data.confirmableAtMs)} (${untilMs(data.confirmableAtMs, now)})`
                            : "—"}
                    </dd>
                </dl>
            )}
        </div>
    );
}
