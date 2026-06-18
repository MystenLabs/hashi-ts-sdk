import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useHashiClient } from "../lib/hashi.ts";
import { TipButton } from "../lib/TipButton.tsx";
import { sats, mist, describeError } from "../lib/format.ts";

export function FeesSection() {
    const account = useCurrentAccount();
    const hashiClient = useHashiClient();
    const sender = account?.address;

    const { data, error, isFetching, refetch } = useQuery({
        queryKey: ["hashi", "fees", sender],
        enabled: !!sender,
        queryFn: async () => {
            const [deposit, withdrawal] = await Promise.all([
                hashiClient.hashi.view.depositGasEstimate(sender!),
                hashiClient.hashi.view.withdrawalFees(sender!),
            ]);
            return { deposit, withdrawal };
        },
    });

    return (
        <section className="section">
            <h2>
                <span className="num">6</span> Fees &amp; gas estimates
            </h2>
            <p className="calls">
                Calls <code>view.depositGasEstimate(sender)</code> and{" "}
                <code>view.withdrawalFees(sender)</code>
            </p>
            <div className="row">
                <TipButton
                    tip="Dry-run deposit gas and withdrawal fees via view.depositGasEstimate() and view.withdrawalFees()."
                    onClick={() => refetch()}
                    disabled={isFetching || !sender}
                >
                    {isFetching ? "Estimating…" : "Estimate"}
                </TipButton>
            </div>
            {!sender && (
                <p className="muted" style={{ marginTop: "0.5rem" }}>
                    Connect a wallet to estimate gas.
                </p>
            )}
            {error && (
                <p className="err" style={{ marginTop: "0.75rem" }}>
                    {describeError(error)}
                </p>
            )}
            {data && (
                <dl className="kv" style={{ marginTop: "1rem" }}>
                    <dt>deposit gas (est.)</dt>
                    <dd>{mist(data.deposit.gasEstimateMist)}</dd>
                    <dt>withdrawal gas (est.)</dt>
                    <dd>{mist(data.withdrawal.gasEstimateMist)}</dd>
                    <dt>withdrawal minimum</dt>
                    <dd>{sats(data.withdrawal.withdrawalMinimumSats)}</dd>
                    <dt>worst-case network fee</dt>
                    <dd>{sats(data.withdrawal.worstCaseNetworkFeeSats)}</dd>
                </dl>
            )}
            <p className="muted small" style={{ marginTop: "0.5rem" }}>
                Gas is estimated via dry-run (best-effort; <code>0</code> if simulation fails). The
                network fee is the worst-case BTC miner fee deducted from a withdrawal.
            </p>
        </section>
    );
}
