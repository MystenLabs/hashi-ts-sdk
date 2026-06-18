import { useQuery } from "@tanstack/react-query";
import { useHashiClient } from "../lib/hashi.ts";
import { TipButton } from "../lib/TipButton.tsx";
import { sats, describeError } from "../lib/format.ts";

export function GovernanceSection() {
    const hashiClient = useHashiClient();
    const { data, error, isFetching, refetch } = useQuery({
        queryKey: ["hashi", "view"],
        queryFn: () => hashiClient.hashi.view.all(),
    });

    return (
        <section className="section">
            <h2>
                <span className="num">1</span> Protocol status &amp; config
            </h2>
            <p className="calls">
                Calls <code>client.hashi.view.all()</code>
            </p>
            <div className="row">
                <TipButton
                    tip="Re-read all protocol config and pause state via view.all()."
                    onClick={() => refetch()}
                    disabled={isFetching}
                >
                    {isFetching ? "Refreshing…" : "Refresh"}
                </TipButton>
                {data && (
                    <span className={`badge ${data.paused ? "badge-err" : "badge-ok"}`}>
                        {data.paused ? "paused" : "live"}
                    </span>
                )}
            </div>
            {error && (
                <p className="err" style={{ marginTop: "0.75rem" }}>
                    {describeError(error)}
                </p>
            )}
            {data && (
                <dl className="kv" style={{ marginTop: "1rem" }}>
                    <dt>paused</dt>
                    <dd>{String(data.paused)}</dd>
                    <dt>bitcoinChainId</dt>
                    <dd>{data.bitcoinChainId}</dd>
                    <dt>bitcoinDepositMinimum</dt>
                    <dd>{sats(data.bitcoinDepositMinimum)}</dd>
                    <dt>bitcoinWithdrawalMinimum</dt>
                    <dd>{sats(data.bitcoinWithdrawalMinimum)}</dd>
                    <dt>bitcoinConfirmationThreshold</dt>
                    <dd>{data.bitcoinConfirmationThreshold.toString()} blocks</dd>
                    <dt>bitcoinDepositTimeDelayMs</dt>
                    <dd>{data.bitcoinDepositTimeDelayMs.toString()} ms</dd>
                    <dt>withdrawalCancellationCooldownMs</dt>
                    <dd>{data.withdrawalCancellationCooldownMs.toString()} ms</dd>
                    <dt>worstCaseNetworkFee</dt>
                    <dd>{sats(data.worstCaseNetworkFee)}</dd>
                </dl>
            )}
        </section>
    );
}
