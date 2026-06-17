import { useCurrentClient } from "@mysten/dapp-kit-react";
import { hashi } from "@mysten-incubation/hashi";
import { useMemo } from "react";
import {
  SUI_NETWORK,
  HASHI_OBJECT_ID,
  HASHI_PACKAGE_ID,
  BITCOIN_NETWORK,
  BTC_RPC_URL,
} from "./deployment.ts";

// Re-export for back-compat with sections that import it from here.
export { BTC_RPC_URL } from "./deployment.ts";

export function useHashiClient() {
  const client = useCurrentClient();
  return useMemo(
    () =>
      client.$extend(
        hashi({
          network: SUI_NETWORK,
          // Overrides default to undefined, so the SDK falls back to its built-in
          // NETWORK_CONFIG for the chosen network when no env override is set.
          hashiObjectId: HASHI_OBJECT_ID,
          packageId: HASHI_PACKAGE_ID,
          bitcoinNetwork: BITCOIN_NETWORK,
          btcRpcUrl: BTC_RPC_URL,
        }),
      ),
    [client],
  );
}
