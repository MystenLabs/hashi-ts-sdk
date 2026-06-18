import { useActivity } from "../lib/activity.tsx";
import { TipButton } from "../lib/TipButton.tsx";
import { truncateAddr } from "../lib/format.ts";

const KIND_LABEL: Record<string, string> = {
    deposit: "Deposit",
    "withdrawal-request": "Withdrawal request",
    "withdrawal-cancel": "Cancel withdrawal",
};

export function ActivityLog() {
    const { entries, clear } = useActivity();
    return (
        <section className="section">
            <h2>
                <span className="num">10</span> Activity log
            </h2>
            <p className="calls">In-memory ring buffer (last 10 results).</p>
            <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted">{entries.length} entries</span>
                <TipButton
                    tip="Clear this session's in-memory activity log."
                    onClick={clear}
                    disabled={entries.length === 0}
                >
                    Clear
                </TipButton>
            </div>
            {entries.length === 0 ? (
                <p className="muted" style={{ marginTop: "1rem" }}>
                    No activity yet.
                </p>
            ) : (
                <ul style={{ listStyle: "none", padding: 0, marginTop: "1rem" }}>
                    {entries.map((e) => (
                        <li key={e.id} style={{ padding: "0.5rem 0", borderTop: "1px solid #eee" }}>
                            <div className="row" style={{ justifyContent: "space-between" }}>
                                <span>
                                    <span className={e.status === "success" ? "ok" : "err"}>
                                        {e.status === "success" ? "✓" : "✗"}
                                    </span>{" "}
                                    <strong>{KIND_LABEL[e.kind] ?? e.kind}</strong>{" "}
                                    <span className="muted">
                                        {new Date(e.ts).toLocaleTimeString()}
                                    </span>
                                </span>
                                {e.digest && (
                                    <a
                                        className="mono"
                                        href={`https://suiscan.xyz/devnet/tx/${e.digest}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {truncateAddr(e.digest)}
                                    </a>
                                )}
                            </div>
                            {e.error && (
                                <div className="err mono" style={{ marginTop: "0.25rem" }}>
                                    {e.error}
                                </div>
                            )}
                            {e.events && e.events.length > 0 && (
                                <ul
                                    className="mono muted"
                                    style={{ marginTop: "0.25rem", paddingLeft: "1rem" }}
                                >
                                    {e.events.map((ev, i) => (
                                        <li key={i}>{ev}</li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
