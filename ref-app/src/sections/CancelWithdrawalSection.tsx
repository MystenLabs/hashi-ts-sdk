import { useMutation } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { useHashiClient } from "../lib/hashi.ts";
import { useActivity } from "../lib/activity.tsx";
import { TipButton } from "../lib/TipButton.tsx";
import { describeError } from "../lib/format.ts";

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
    const { push } = useActivity();

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
        onSuccess: (r) => push({ kind: "withdrawal-cancel", status: "success", digest: r.digest }),
        onError: (err) =>
            push({ kind: "withdrawal-cancel", status: "failed", error: describeError(err) }),
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
                <p className="err mono" style={{ marginTop: "0.5rem" }}>
                    {describeError(mutation.error)}
                </p>
            )}
        </section>
    );
}
