import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import type { TransactionHistoryItem } from "@mysten-incubation/hashi";
import { useHashiClient } from "../lib/hashi.ts";
import { sats, whenMs, truncateAddr, describeError } from "../lib/format.ts";

export function TransactionHistorySection() {
    const account = useCurrentAccount();
    const hashiClient = useHashiClient();
    const address = account?.address;

    const { data, error, isFetching, refetch } = useQuery({
        queryKey: ["hashi", "history", address],
        enabled: !!address,
        queryFn: () => hashiClient.hashi.view.transactionHistory(address!),
    });

    return (
        <section className="section">
            <h2>
                <span className="num">9</span> Transaction history
            </h2>
            <p className="calls">
                Calls <code>client.hashi.view.transactionHistory(address)</code>
            </p>
            <div className="row">
                <button onClick={() => refetch()} disabled={isFetching || !address}>
                    {isFetching ? "Loading…" : "Refresh"}
                </button>
            </div>
            {!address && (
                <p className="muted" style={{ marginTop: "0.5rem" }}>
                    Connect a wallet first.
                </p>
            )}
            {error && (
                <p className="err" style={{ marginTop: "0.75rem" }}>
                    {describeError(error)}
                </p>
            )}
            {data && data.length === 0 && (
                <p className="muted" style={{ marginTop: "0.75rem" }}>
                    No deposits or withdrawals yet.
                </p>
            )}
            {data && data.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, marginTop: "1rem" }}>
                    {data.map((item) => (
                        <HistoryRow key={`${item.kind}-${item.requestId}`} item={item} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function HistoryRow({ item }: { item: TransactionHistoryItem }) {
    // Narrow on `item.kind` directly so each branch sees the right union member.
    const view =
        item.kind === "deposit"
            ? {
                  amount: item.amountSats,
                  statusBadge: item.approved ? "badge-ok" : "badge-pending",
                  statusLabel: item.approved ? "approved" : "pending",
                  btc: item.btcTxid ? `${item.btcTxid}:${item.btcVout}` : null,
              }
            : {
                  amount: item.btcAmountSats,
                  statusBadge: item.status === "Confirmed" ? "badge-ok" : "badge-pending",
                  statusLabel: item.status,
                  btc: item.btcTxid,
              };

    return (
        <li style={{ padding: "0.5rem 0", borderTop: "1px solid #eee" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
                <span>
                    <span
                        className={`badge ${item.kind === "deposit" ? "badge-info" : "badge-warn"}`}
                    >
                        {item.kind}
                    </span>{" "}
                    <strong>{sats(view.amount)}</strong>{" "}
                    <span className="muted small">{whenMs(item.timestampMs)}</span>
                </span>
                <span>
                    <span className={`badge ${view.statusBadge}`}>{view.statusLabel}</span>{" "}
                    <a
                        className="mono"
                        href={`https://suiscan.xyz/devnet/tx/${item.suiTxDigest}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {truncateAddr(item.suiTxDigest)}
                    </a>
                </span>
            </div>
            {view.btc && (
                <div className="mono small muted" style={{ marginTop: "0.2rem" }}>
                    btc: {view.btc}
                </div>
            )}
        </li>
    );
}
