import { useQuery } from "@tanstack/react-query";
import { useHashiClient } from "../lib/hashi.ts";
import { TipButton } from "../lib/TipButton.tsx";
import { hex, describeError } from "../lib/format.ts";

export function CommitteeSection() {
    const hashiClient = useHashiClient();
    const mpc = useQuery({
        queryKey: ["hashi", "mpcPublicKey"],
        queryFn: () => hashiClient.hashi.view.mpcPublicKey(),
        retry: false,
    });
    // Shares the ["hashi","view"] cache with §1 — one fetch serves both.
    const cfg = useQuery({
        queryKey: ["hashi", "view"],
        queryFn: () => hashiClient.hashi.view.all(),
    });

    const guardianProvisioned = cfg.data?.guardianBtcPublicKey != null;
    const busy = mpc.isFetching || cfg.isFetching;

    return (
        <section className="section">
            <h2>
                <span className="num">2</span> Committee &amp; guardian
            </h2>
            <p className="calls">
                Calls <code>client.hashi.view.mpcPublicKey()</code> and reads guardian config from{" "}
                <code>view.all()</code>
            </p>
            <div className="row">
                <TipButton
                    tip="Re-read the MPC committee key and guardian config via view.mpcPublicKey() and view.all()."
                    onClick={() => {
                        mpc.refetch();
                        cfg.refetch();
                    }}
                    disabled={busy}
                >
                    {busy ? "Refreshing…" : "Refresh"}
                </TipButton>
                {cfg.data && (
                    <span className={`badge ${guardianProvisioned ? "badge-ok" : "badge-warn"}`}>
                        {guardianProvisioned ? "guardian provisioned" : "guardian not provisioned"}
                    </span>
                )}
            </div>
            {mpc.error && (
                <div className="callout callout-warn">
                    MPC committee key unavailable — {describeError(mpc.error)} (DKG may not have
                    completed on this deployment).
                </div>
            )}
            <dl className="kv" style={{ marginTop: "1rem" }}>
                <dt>MPC committee key (compressed secp256k1)</dt>
                <dd>{mpc.data ? `0x${hex(mpc.data)}` : mpc.isFetching ? "…" : "—"}</dd>
                <dt>guardianBtcPublicKey (BIP-340 x-only)</dt>
                <dd>
                    {!cfg.data
                        ? "…"
                        : cfg.data.guardianBtcPublicKey
                          ? `0x${hex(cfg.data.guardianBtcPublicKey)}`
                          : "not set"}
                </dd>
                <dt>guardianUrl</dt>
                <dd>{!cfg.data ? "…" : (cfg.data.guardianUrl ?? "not set")}</dd>
                <dt>guardianPublicKey (Ed25519 attestation)</dt>
                <dd>
                    {!cfg.data
                        ? "…"
                        : cfg.data.guardianPublicKey
                          ? `0x${hex(cfg.data.guardianPublicKey)}`
                          : "not set"}
                </dd>
            </dl>
            <p className="muted small" style={{ marginTop: "0.5rem" }}>
                Deposit addresses are taproot outputs with an immediate 2-of-2 leaf (MPC committee +
                guardian) and a delayed MPC-only recovery leaf. Address derivation (§3) needs{" "}
                <code>guardianBtcPublicKey</code> set on-chain.
            </p>
        </section>
    );
}
