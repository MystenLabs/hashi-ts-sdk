import { useQuery } from "@tanstack/react-query";
import { useHashiClient } from "./hashi.ts";

/**
 * Live deposit status for a Sui tx digest. Polls `view.depositStatus` every 10s
 * until the deposit reaches a terminal state (`confirmed` or `expired`).
 *
 * The one-shot imperative equivalent is `client.hashi.waitForDeposit(digest)`,
 * which resolves once the deposit is confirmed/expired.
 */
export function useDepositStatus(digest?: string) {
  const hashiClient = useHashiClient();
  return useQuery({
    queryKey: ["depositStatus", digest],
    enabled: !!digest,
    queryFn: () => hashiClient.hashi.view.depositStatus(digest!),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "confirmed" || status === "expired" ? false : 10_000;
    },
  });
}

/**
 * Live withdrawal status for a Sui tx digest. Polls `view.withdrawalStatus`
 * every 10s until terminal (`Confirmed` or `cancelled`).
 *
 * The one-shot imperative equivalent is `client.hashi.waitForWithdrawal(digest)`.
 */
export function useWithdrawalStatus(digest?: string) {
  const hashiClient = useHashiClient();
  return useQuery({
    queryKey: ["withdrawalStatus", digest],
    enabled: !!digest,
    queryFn: () => hashiClient.hashi.view.withdrawalStatus(digest!),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "Confirmed" || status === "cancelled" ? false : 10_000;
    },
  });
}
