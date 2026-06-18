import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dAppKit } from "./dappkit.ts";
import { App } from "./App.tsx";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <DAppKitProvider dAppKit={dAppKit}>
                <App />
            </DAppKitProvider>
        </QueryClientProvider>
    </StrictMode>,
);
