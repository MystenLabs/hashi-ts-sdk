import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { bitcoinAddressToWitnessProgram } from "@mysten-incubation/hashi";
import type { WithdrawalStatus } from "@mysten-incubation/hashi";
import { useHashiClient } from "../lib/hashi.ts";
import { useWithdrawalStatus } from "../lib/poll.ts";
import { useActivity } from "../lib/activity.tsx";
import { BITCOIN_NETWORK } from "../lib/btc-type.ts";
import { sats, describeError } from "../lib/format.ts";

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

export function RequestWithdrawalSection({
    onRequestCreated,
}: {
    onRequestCreated?: (requestId: string) => void;
}) {
    const account = useCurrentAccount();
    const dAppKit = useDAppKit();
    const hashiClient = useHashiClient();
    const { push } = useActivity();

    const [bitcoinAddress, setBitcoinAddress] = useState("");
    const [amountSats, setAmountSats] = useState("");
    const [digest, setDigest] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: async () => {
            const { program } = bitcoinAddressToWitnessProgram(bitcoinAddress, BITCOIN_NETWORK);
            const transaction = hashiClient.hashi.tx.requestWithdrawal({
                amount: BigInt(amountSats || "0"),
                bitcoinAddress: program,
            });
            const res = await dAppKit.signAndExecuteTransaction({ transaction });
            return { digest: extractDigest(res) };
        },
        onSuccess: (r) => {
            setDigest(r.digest ?? null);
            push({ kind: "withdrawal-request", status: "success", digest: r.digest });
        },
        onError: (err) => {
            setDigest(null);
            push({ kind: "withdrawal-request", status: "failed", error: describeError(err) });
        },
    });

    return (
        <section className="section">
            <h2>
                <span className="num">7</span> Request a withdrawal
            </h2>
            <p className="calls">
                Calls <code>{`client.hashi.tx.requestWithdrawal({ amount, bitcoinAddress })`}</code>{" "}
                then signs via the connected wallet.
            </p>

            <label>
                Destination Bitcoin address (bech32 P2WPKH or bech32m P2TR, {BITCOIN_NETWORK}):
            </label>
            <input
                value={bitcoinAddress}
                onChange={(e) => setBitcoinAddress(e.target.value)}
                placeholder="tb1q… or tb1p…"
            />

            <label>amountSats:</label>
            <input
                value={amountSats}
                onChange={(e) => setAmountSats(e.target.value)}
                placeholder="e.g. 50000"
            />

            <div className="row" style={{ marginTop: "1rem" }}>
                <button
                    className="primary"
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending || !account}
                >
                    {mutation.isPending ? "Submitting…" : "Request withdrawal"}
                </button>
            </div>
            {!account && (
                <p className="muted" style={{ marginTop: "0.5rem" }}>
                    Connect a wallet first.
                </p>
            )}

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
                    <WithdrawalStatusTracker digest={digest} onRequestId={onRequestCreated} />
                </div>
            )}
        </section>
    );
}

function withdrawalBadge(status?: WithdrawalStatus | "cancelled"): string {
    switch (status) {
        case "Confirmed":
            return "badge-ok";
        case "cancelled":
            return "badge-err";
        case undefined:
            return "badge-info";
        default:
            return "badge-pending";
    }
}

function WithdrawalStatusTracker({
    digest,
    onRequestId,
}: {
    digest: string;
    onRequestId?: (requestId: string) => void;
}) {
    const { data, error, isFetching, refetch } = useWithdrawalStatus(digest);
    const requestId = data?.requestId;

    // Surface the requestId (parsed server-side from WithdrawalRequestedEvent) up
    // to §8 once the status read resolves it. The dapp-kit execution result has no
    // events, so this is the SDK-native way to get the requestId.
    useEffect(() => {
        if (requestId) onRequestId?.(requestId);
    }, [requestId, onRequestId]);

    return (
        <div className="subpanel">
            <h3>Withdrawal status</h3>
            <p className="calls">
                Polls <code>client.hashi.view.withdrawalStatus(digest)</code> (imperative
                equivalent: <code>waitForWithdrawal</code>)
            </p>
            <div className="row">
                <span className={`badge ${withdrawalBadge(data?.status)}`}>
                    {data?.status ?? (isFetching ? "…" : "unknown")}
                </span>
                <button onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? "Refreshing…" : "Refresh"}
                </button>
            </div>
            <p className="muted small" style={{ marginTop: "0.5rem" }}>
                Lifecycle: Requested → Approved → Processing → Signed → Confirmed
            </p>
            {error && <p className="err">{describeError(error)}</p>}
            {data && (
                <dl className="kv" style={{ marginTop: "0.5rem" }}>
                    <dt>requestId</dt>
                    <dd>
                        {data.requestId}
                        <br />
                        <span className="muted small">(auto-pasted into §8 below)</span>
                    </dd>
                    <dt>amount</dt>
                    <dd>{sats(data.btcAmountSats)}</dd>
                    <dt>btcTxid</dt>
                    <dd>{data.btcTxid ?? "—"}</dd>
                </dl>
            )}
        </div>
    );
}
