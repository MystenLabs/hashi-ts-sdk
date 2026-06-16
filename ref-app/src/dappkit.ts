import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { devWalletInitializer } from "@mysten-incubation/dev-wallet";
import { WebCryptoSignerAdapter } from "@mysten-incubation/dev-wallet/adapters";

export const dAppKit = createDAppKit({
    networks: ["devnet"],
    defaultNetwork: "devnet",
    createClient: (network) =>
        new SuiGrpcClient({
            network,
            baseUrl: "https://fullnode.devnet.sui.io:443",
        }),
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
