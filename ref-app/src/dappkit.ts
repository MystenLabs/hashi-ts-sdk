import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { devWalletInitializer } from "@mysten-incubation/dev-wallet";
import { WebCryptoSignerAdapter } from "@mysten-incubation/dev-wallet/adapters";
import { SUI_NETWORK, SUI_RPC_URL } from "./lib/deployment.ts";

export const dAppKit = createDAppKit({
    networks: [SUI_NETWORK],
    defaultNetwork: SUI_NETWORK,
    createClient: (network) => new SuiGrpcClient({ network, baseUrl: SUI_RPC_URL }),
    walletInitializers: [
        devWalletInitializer({
            adapters: [new WebCryptoSignerAdapter()],
            autoConnect: true,
            mountUI: true,
        }),
    ],
});

declare module "@mysten/dapp-kit-react" {
    interface Register {
        dAppKit: typeof dAppKit;
    }
}
