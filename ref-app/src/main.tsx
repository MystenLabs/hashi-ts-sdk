import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dAppKit } from "./dappkit.ts";
import { ActivityProvider } from "./lib/activity.tsx";
import { App } from "./App.tsx";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <DAppKitProvider dAppKit={dAppKit}>
                <ActivityProvider>
                    <App />
                </ActivityProvider>
            </DAppKitProvider>
        </QueryClientProvider>
    </StrictMode>,
);
