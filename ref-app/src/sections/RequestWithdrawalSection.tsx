import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { bitcoinAddressToWitnessProgram } from "@mysten-incubation/hashi";
import type { WithdrawalStatus } from "@mysten-incubation/hashi";
import { useHashiClient } from "../lib/hashi.ts";
import { useWithdrawalStatus } from "../lib/poll.ts";
import { BITCOIN_NETWORK } from "../lib/btc-type.ts";
import { TipButton } from "../lib/TipButton.tsx";
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
        },
        onError: () => {
            setDigest(null);
        },
    });

    // Reuse §3's derived deposit address and §5's balance (same query keys →
    // shared caches) to auto-fill a round-trip withdrawal back to yourself.
    const { data: depositAddr } = useQuery({
        queryKey: ["hashi", "depositAddr", account?.address],
        enabled: !!account?.address,
        retry: false,
        queryFn: () => hashiClient.hashi.generateDepositAddress({ suiAddress: account!.address }),
    });
    const { data: balance } = useQuery({
        queryKey: ["hashi", "balance", account?.address],
        enabled: !!account?.address,
        queryFn: () => hashiClient.hashi.view.balance(account!.address),
    });
    // Withdrawal minimum from the shared ["hashi","view"] config cache (§1).
    const { data: config } = useQuery({
        queryKey: ["hashi", "view"],
        queryFn: () => hashiClient.hashi.view.all(),
    });
    const minSats = config?.bitcoinWithdrawalMinimum;

    // Default to the minimum withdrawal so a single deposit funds many round-trips
    // (instead of draining the whole balance and forcing a fresh deposit each time).
    const canAutofill =
        !!depositAddr && !!balance && minSats != null && balance.totalBalance >= minSats;
    const autofill = () => {
        if (!depositAddr || minSats == null) return;
        setBitcoinAddress(depositAddr);
        setAmountSats(minSats.toString());
    };
    const autofillHint = !depositAddr
        ? "Derive your address in §3 first."
        : minSats == null || !balance
          ? "Loading your balance and the withdrawal minimum…"
          : balance.totalBalance < minSats
            ? `Your hBTC balance (${sats(balance.totalBalance)}) is below the withdrawal minimum (${sats(minSats)}) — deposit more in §4 first.`
            : `Fills the destination with your own §3 deposit address and the amount with the withdrawal minimum (${sats(minSats)}) — a round-trip back to yourself that spends as little as possible, so one deposit funds many withdrawals. Edit either field before submitting.`;

    return (
        <section className="section">
            <h2>
                <span className="num">7</span> Request a withdrawal
            </h2>
            <p className="calls">
                Calls <code>{`client.hashi.tx.requestWithdrawal({ amount, bitcoinAddress })`}</code>{" "}
                then signs via the connected wallet.
            </p>

            <div className="row" style={{ marginBottom: "0.75rem" }}>
                <TipButton
                    tip={autofillHint}
                    mono
                    type="button"
                    onClick={autofill}
                    disabled={!canAutofill}
                >
                    Auto-fill min withdrawal to yourself
                </TipButton>
            </div>

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
                <TipButton
                    tip="Build tx.requestWithdrawal, sign with your wallet, and submit the withdrawal request to the committee."
                    className="primary"
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending || !account}
                >
                    {mutation.isPending ? "Submitting…" : "Request withdrawal"}
                </TipButton>
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
                <TipButton
                    tip="Re-poll view.withdrawalStatus(digest) for the latest lifecycle state."
                    onClick={() => refetch()}
                    disabled={isFetching}
                >
                    {isFetching ? "Refreshing…" : "Refresh"}
                </TipButton>
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
