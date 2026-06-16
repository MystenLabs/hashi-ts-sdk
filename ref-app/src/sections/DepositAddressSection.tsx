import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { HashiConfigError } from "@mysten-incubation/hashi";
import { useHashiClient, BTC_RPC_URL } from "../lib/hashi.ts";
import { describeError } from "../lib/format.ts";

export function DepositAddressSection() {
    const account = useCurrentAccount();
    const hashiClient = useHashiClient();
    const suiAddress = account?.address;
    const { data, error, isFetching, refetch } = useQuery({
        queryKey: ["hashi", "depositAddr", suiAddress],
        enabled: !!suiAddress,
        retry: false,
        queryFn: () => hashiClient.hashi.generateDepositAddress({ suiAddress: suiAddress! }),
    });

    if (!suiAddress) {
        return (
            <section className="section">
                <h2>
                    <span className="num">3</span> Your deposit address
                </h2>
                <p className="muted">Connect a wallet first.</p>
            </section>
        );
    }

    return (
        <section className="section">
            <h2>
                <span className="num">3</span> Your deposit address
            </h2>
            <p className="calls">
                Calls <code>{`client.hashi.generateDepositAddress({ suiAddress })`}</code>
            </p>
            <p className="muted small">
                A unique P2TR signet address — a 2-of-2 taproot{" "}
                <code>tr(NUMS, multi_a(2, guardian, mpc-child))</code>. Send signet BTC here (e.g.{" "}
                <a href="https://signetfaucet.com" target="_blank" rel="noreferrer">
                    signetfaucet.com
                </a>
                ), wait for confirmation, then record the funding tx in §4.
            </p>
            <div className="row">
                <button onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? "Deriving…" : "Refresh"}
                </button>
            </div>
            {error && (
                <div className="callout callout-warn">
                    {error instanceof HashiConfigError
                        ? "Guardian not provisioned on this deployment yet — deposit-address derivation is unavailable until guardian_btc_public_key is set on-chain."
                        : describeError(error)}
                </div>
            )}
            {data && (
                <div style={{ marginTop: "1rem" }}>
                    <div className="mono addr-box">{data}</div>
                    <div className="row" style={{ marginTop: "0.5rem" }}>
                        <button onClick={() => navigator.clipboard.writeText(data)}>Copy</button>
                        <a
                            href={`https://mempool.space/signet/address/${data}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            View on mempool.space
                        </a>
                    </div>
                    {BTC_RPC_URL && <BtcRpcLookup depositAddress={data} />}
                </div>
            )}
        </section>
    );
}

/** Optional helper, shown only when VITE_BTC_RPC_URL is configured. */
function BtcRpcLookup({ depositAddress }: { depositAddress: string }) {
    const hashiClient = useHashiClient();
    const [txid, setTxid] = useState("");
    const { data, error, isFetching, refetch } = useQuery({
        queryKey: ["btcrpc", "lookupAllVouts", txid, depositAddress],
        enabled: false,
        retry: false,
        queryFn: () => hashiClient.hashi.bitcoin.lookupAllVouts(txid, depositAddress),
    });

    return (
        <div className="subpanel">
            <h3>BTC RPC — outputs paying this address</h3>
            <p className="calls">
                Calls <code>{`client.hashi.bitcoin.lookupAllVouts(txid, address)`}</code>
            </p>
            <label>Funding txid</label>
            <input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="txid" />
            <div className="row" style={{ marginTop: "0.5rem" }}>
                <button onClick={() => refetch()} disabled={!txid || isFetching}>
                    {isFetching ? "Looking up…" : "Look up vouts"}
                </button>
            </div>
            {error && <p className="err">{describeError(error)}</p>}
            {data && (
                <pre>
                    {JSON.stringify(
                        data.map((v) => ({ vout: v.vout, amountSats: v.amountSats.toString() })),
                        null,
                        2,
                    )}
                </pre>
            )}
        </div>
    );
}
