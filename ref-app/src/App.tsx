import { useState } from "react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { GovernanceSection } from "./sections/GovernanceSection.tsx";
import { CommitteeSection } from "./sections/CommitteeSection.tsx";
import { DepositAddressSection } from "./sections/DepositAddressSection.tsx";
import { RecordDepositSection } from "./sections/RecordDepositSection.tsx";
import { BalanceSection } from "./sections/BalanceSection.tsx";
import { FeesSection } from "./sections/FeesSection.tsx";
import { RequestWithdrawalSection } from "./sections/RequestWithdrawalSection.tsx";
import { CancelWithdrawalSection } from "./sections/CancelWithdrawalSection.tsx";
import { TransactionHistorySection } from "./sections/TransactionHistorySection.tsx";
import { useHashiClient } from "./lib/hashi.ts";
import { SUI_NETWORK, BITCOIN_NETWORK, HASHI_OBJECT_ID } from "./lib/deployment.ts";
import { describeError } from "./lib/format.ts";
import "./App.css";

export function App() {
    const account = useCurrentAccount();
    const [requestId, setRequestId] = useState("");
    return (
        <div className="app">
            <div className="topbar">
                <div>
                    <h1>Hashi SDK Reference App</h1>
                    <div className="sub">
                        @mysten-incubation/hashi · Sui {SUI_NETWORK} · BTC {BITCOIN_NETWORK}
                    </div>
                </div>
                <ConnectButton />
            </div>

            {account ? (
                <p className="muted">
                    Connected as <span className="mono">{account.address}</span>
                </p>
            ) : (
                <p className="muted">
                    Connect a wallet to continue. The dev-wallet option creates a fresh devnet key
                    in your browser.
                </p>
            )}

            <DeploymentBanner />

            <div className="guide">
                <h2>Live demo — the deposit → mint → withdraw happy path</h2>
                <ul>
                    <li>
                        Connect a wallet (dev-wallet creates a devnet key in-browser, no extension
                        needed).
                    </li>
                    <li>
                        §3 derive your unique taproot deposit address, then fund it with signet BTC
                        (e.g.{" "}
                        <a
                            href="https://signet257.bublina.eu.org/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            signet257.bublina.eu.org
                        </a>
                        ).
                    </li>
                    <li>
                        §4 record the funding tx and track it until <strong>confirmed</strong>{" "}
                        (committee approval + time-delay).
                    </li>
                    <li>§5 watch your hBTC balance appear once the committee mints.</li>
                    <li>
                        §7 request a withdrawal to a signet address and track its lifecycle — or §8
                        cancel while still pending.
                    </li>
                </ul>
            </div>

            <GovernanceSection />
            <CommitteeSection />
            <DepositAddressSection />
            <RecordDepositSection />
            <BalanceSection />
            <FeesSection />
            <RequestWithdrawalSection onRequestCreated={setRequestId} />
            <CancelWithdrawalSection requestId={requestId} setRequestId={setRequestId} />
            <TransactionHistorySection />
        </div>
    );
}

/**
 * Shows a clear, actionable banner when the configured Hashi deployment can't be
 * reached — most commonly because Sui devnet was reset and the built-in IDs went
 * stale. Shares the ["hashi","view"] query cache with §1/§2, so it adds no extra
 * fetch.
 */
function DeploymentBanner() {
    const hashiClient = useHashiClient();
    const { error } = useQuery({
        queryKey: ["hashi", "view"],
        queryFn: () => hashiClient.hashi.view.all(),
    });
    if (!error) return null;
    return (
        <div className="callout callout-warn" style={{ marginBottom: "1.5rem" }}>
            <strong>Can't reach a live Hashi deployment.</strong> The configured deployment (
            <span className="mono">{HASHI_OBJECT_ID ?? "(unset)"}</span> on Sui{" "}
            <code>{SUI_NETWORK}</code>) returned an error. Sui devnet is reset periodically, so
            previously-deployed object/package IDs go stale. Point the app at a live deployment by
            setting <code>VITE_SUI_NETWORK</code>, <code>VITE_HASHI_OBJECT_ID</code>,{" "}
            <code>VITE_HASHI_PACKAGE_ID</code> (and optionally <code>VITE_SUI_RPC_URL</code> /{" "}
            <code>VITE_BITCOIN_NETWORK</code>) in <code>ref-app/.env</code>, then restart the dev
            server.
            <div className="mono small" style={{ marginTop: "0.5rem" }}>
                {describeError(error)}
            </div>
        </div>
    );
}
