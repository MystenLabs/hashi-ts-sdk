import { useMutation } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { useHashiClient } from "../lib/hashi.ts";
import { TipButton } from "../lib/TipButton.tsx";
import { describeCancelWithdrawalError } from "../lib/format.ts";

function extractTxBody(res: unknown): { digest?: string } {
    if (!res || typeof res !== "object") return {};
    const root: any = res;
    if (root.$kind === "Transaction" && root.Transaction) {
        return { digest: root.Transaction.digest };
    }
    if (root.$kind === "FailedTransaction") {
        throw new Error(`Transaction failed: ${JSON.stringify(root.FailedTransaction)}`);
    }
    return { digest: root.digest };
}

export function CancelWithdrawalSection({
    requestId,
    setRequestId,
}: {
    requestId: string;
    setRequestId: (v: string) => void;
}) {
    const account = useCurrentAccount();
    const dAppKit = useDAppKit();
    const hashiClient = useHashiClient();

    const mutation = useMutation({
        mutationFn: async () => {
            if (!account) throw new Error("Wallet not connected");
            const transaction = hashiClient.hashi.tx.cancelWithdrawal({
                requestId,
                recipient: account.address,
            });
            const res = await dAppKit.signAndExecuteTransaction({ transaction });
            return extractTxBody(res);
        },
    });

    return (
        <section className="section">
            <h2>
                <span className="num">8</span> Cancel a withdrawal
            </h2>
            <p className="calls">
                Calls <code>{`client.hashi.tx.cancelWithdrawal({ requestId, recipient })`}</code>{" "}
                then signs via the connected wallet.
            </p>
            <p className="muted">
                Only the original requester can cancel, and only while the request is still{" "}
                <code>Requested</code> or <code>Approved</code>, after the on-chain cooldown
                elapses. The Move side enforces all three.
            </p>
            <p className="muted small">
                <strong>Timing.</strong> The cooldown is counted from when you <em>requested</em>{" "}
                the withdrawal (not from when it became <code>Approved</code>) and is a
                governance-set value — see <code>withdrawalCancellationCooldownMs</code> in §1
                (currently 1&nbsp;hour on devnet). Cancellation therefore only works in the window
                between the cooldown elapsing and the committee committing the request to{" "}
                <code>Processing</code>: try too early and you get a “cooldown has not elapsed”
                error; once it reaches <code>Processing</code> the hBTC is burned and it can no
                longer be cancelled.
            </p>

            <label>requestId (0x-prefixed 32-byte hex):</label>
            <input
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                placeholder="0x..."
            />

            <div className="row" style={{ marginTop: "1rem" }}>
                <TipButton
                    tip="Build tx.cancelWithdrawal for this requestId, sign with your wallet, and submit. Only the requester can cancel, while Requested/Approved and after the cooldown."
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending || !requestId || !account}
                >
                    {mutation.isPending ? "Submitting…" : "Cancel withdrawal"}
                </TipButton>
            </div>

            {mutation.error && (
                <p className="err" style={{ marginTop: "0.5rem" }}>
                    {describeCancelWithdrawalError(mutation.error)}
                </p>
            )}
        </section>
    );
}
