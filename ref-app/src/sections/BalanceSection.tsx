import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useHashiClient } from "../lib/hashi.ts";
import { BTC_TYPE } from "../lib/btc-type.ts";
import { sats, btc, describeError } from "../lib/format.ts";

export function BalanceSection() {
    const account = useCurrentAccount();
    const hashiClient = useHashiClient();
    const owner = account?.address;

    const { data, error, isFetching, refetch } = useQuery({
        queryKey: ["hashi", "balance", owner],
        enabled: !!owner,
        queryFn: () => hashiClient.hashi.view.balance(owner!),
        // Poll while the balance is still zero so it "appears" once the committee
        // mints; stop polling once there's a non-zero balance.
        refetchInterval: (query) => {
            const total = query.state.data?.totalBalance;
            return total && total > 0n ? false : 10_000;
        },
    });

    if (!owner) {
        return (
            <section className="section">
                <h2>
                    <span className="num">5</span> Your hBTC balance
                </h2>
                <p className="muted">Connect a wallet first.</p>
            </section>
        );
    }

    return (
        <section className="section">
            <h2>
                <span className="num">5</span> Your hBTC balance
            </h2>
            <p className="calls">
                Calls <code>client.hashi.view.balance(owner)</code>
            </p>
            <div className="row">
                <button onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? "Loading…" : "Refresh"}
                </button>
            </div>
            {error && (
                <p className="err" style={{ marginTop: "0.75rem" }}>
                    {describeError(error)}
                </p>
            )}
            {data && (
                <div style={{ marginTop: "0.75rem" }}>
                    <p className="mono">
                        {sats(data.totalBalance)}{" "}
                        <span className="muted">({btc(data.totalBalance)})</span>
                    </p>
                    <p className="muted small">{data.coinObjectCount} coin object(s)</p>
                </div>
            )}
            <p className="muted small" style={{ marginTop: "0.5rem" }}>
                Coin type: <span className="mono">{BTC_TYPE ?? "—"}</span>
            </p>
        </section>
    );
}
