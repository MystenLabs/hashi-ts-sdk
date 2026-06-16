import { useState } from "react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { GovernanceSection } from "./sections/GovernanceSection.tsx";
import { CommitteeSection } from "./sections/CommitteeSection.tsx";
import { DepositAddressSection } from "./sections/DepositAddressSection.tsx";
import { RecordDepositSection } from "./sections/RecordDepositSection.tsx";
import { BalanceSection } from "./sections/BalanceSection.tsx";
import { FeesSection } from "./sections/FeesSection.tsx";
import { RequestWithdrawalSection } from "./sections/RequestWithdrawalSection.tsx";
import { CancelWithdrawalSection } from "./sections/CancelWithdrawalSection.tsx";
import { TransactionHistorySection } from "./sections/TransactionHistorySection.tsx";
import { ActivityLog } from "./sections/ActivityLog.tsx";
import "./App.css";

export function App() {
    const account = useCurrentAccount();
    const [requestId, setRequestId] = useState("");
    return (
        <div className="app">
            <div className="topbar">
                <div>
                    <h1>Hashi SDK Reference App</h1>
                    <div className="sub">@mysten-incubation/hashi · Sui devnet · BTC signet</div>
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

            <div className="guide">
                <h2>Live demo — the deposit → mint → withdraw happy path</h2>
                <ol>
                    <li>
                        Connect a wallet (dev-wallet creates a devnet key in-browser, no extension
                        needed).
                    </li>
                    <li>
                        §3 derive your unique 2-of-2 deposit address, then fund it with signet BTC
                        (e.g.{" "}
                        <a href="https://signetfaucet.com" target="_blank" rel="noreferrer">
                            signetfaucet.com
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
                </ol>
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
            <ActivityLog />
        </div>
    );
}
