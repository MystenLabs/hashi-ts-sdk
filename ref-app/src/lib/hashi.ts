import { useCurrentClient } from "@mysten/dapp-kit-react";
import { hashi } from "@mysten-incubation/hashi";
import { useMemo } from "react";

/**
 * Optional Bitcoin Core JSON-RPC URL. When set (via a `.env` `VITE_BTC_RPC_URL`),
 * the SDK's `client.hashi.bitcoin.*` lookups become available in the app. Off by
 * default because a browser calling Bitcoin Core directly hits CORS.
 */
export const BTC_RPC_URL = (import.meta.env.VITE_BTC_RPC_URL as string | undefined) || undefined;

export function useHashiClient() {
  const client = useCurrentClient();
  return useMemo(
    () => client.$extend(hashi({ network: "devnet", btcRpcUrl: BTC_RPC_URL })),
    [client],
  );
}
