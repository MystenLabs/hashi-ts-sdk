# ref-app §4 — auto-fill deposit UTXOs from a public explorer

## Goal

In §4 "Record a deposit", add a one-click **"Auto-fill from deposit address"**
button that looks up the user's derived P2TR deposit address on a public Bitcoin
explorer (mempool.space), then populates the funding `txid`, vout rows
(`vout` + `amountSats`), and recipient — so the user reviews the values and just
clicks **Submit deposit**.

This removes the manual, error-prone step of opening mempool.space, finding the
output that pays the deposit address, and copying txid/vout/value by hand.

## Why a ref-app helper, not the SDK

The SDK's `client.hashi.bitcoin.*` talks to a **Bitcoin Core JSON-RPC** node
(`btcRpcUrl`) and a browser calling Core directly hits CORS — which is why those
helpers are off by default in the ref-app. mempool.space's **REST API is
CORS-enabled**, so the browser can fetch it directly with no proxy and no
`btcRpcUrl`. This is a UX convenience for the demo, not SDK surface, so it lives
entirely in the ref-app and keeps the SDK boundary clean (CLAUDE.md: "the SDK is
user-facing only").

## Key constraint

§4's form has a **single `txid` field** with multiple vout rows
(`RecordDepositSection.tsx`). One submission therefore records vouts from **one**
funding tx. A deposit address can be funded by several txs, so auto-fill picks
**one** funding tx per click and notes if others remain.

## Components

### `ref-app/src/lib/mempool.ts` (new, pure module)

A small, framework-agnostic module — no React — so it can be reasoned about and
unit-tested in isolation.

```ts
import type { BitcoinNetwork } from "@mysten-incubation/hashi";

export interface MempoolUtxo {
  txid: string; // display order (mempool's form), no 0x prefix
  vout: number;
  value: number; // sats
  status: { confirmed: boolean };
}

export interface FundingGroup {
  txid: string; // display order
  confirmed: boolean;
  utxos: { vout: number; value: number }[];
}

/** mempool.space base path for a network, or null if unsupported (regtest). */
export function mempoolBase(network: BitcoinNetwork): string | null;

/** GET /address/{addr}/utxo. Throws on unsupported network or HTTP error. */
export function fetchAddressUtxos(network: BitcoinNetwork, address: string): Promise<MempoolUtxo[]>;

/**
 * Group UTXOs by txid; sort confirmed-first then by descending total value.
 * Returns the chosen group plus the count of *other* groups (other funding txs).
 */
export function pickFundingGroup(utxos: MempoolUtxo[]): {
  group: FundingGroup | null;
  otherTxCount: number;
};
```

- `mempoolBase`: `mainnet → "https://mempool.space/api"`,
  `testnet → ".../testnet/api"`, `signet → ".../signet/api"`,
  `regtest → null`.
- `fetchAddressUtxos`: throws `Error("Auto-fill isn't available on regtest …")`
  when `mempoolBase` is null; throws on non-2xx with the status text.

### `RecordDepositSection.tsx` (edit)

- Reuse §3's derived address via the **same React Query** key
  (`["hashi","depositAddr", suiAddress]`, `queryFn: generateDepositAddress`) so
  it shares §3's cache — no re-derivation, and it reflects §3's
  `HashiConfigError` (guardian unprovisioned) state.
- Add a **"Auto-fill from deposit address"** button above the txid input,
  enabled only when the deposit address resolved. It runs a `useMutation` that:
  1. `fetchAddressUtxos(BITCOIN_NETWORK, depositAddr)`
  2. `pickFundingGroup(...)`
  3. sets `txid = "0x" + group.txid`, replaces `rows` with one row per
     `group.utxos` (`vout`, `amountSats = value`), and fills `recipient` with the
     connected address if empty.
- Show a result line: which tx was filled (confirmed/pending badge) and, if
  `otherTxCount > 0`, _"N other funding tx(s) found — submit this one, then
  re-fetch for the rest."_

## States

| State                   | UI                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| address not yet derived | button disabled (guardian-unprovisioned reuses §3's existing notice)                                                                |
| loading                 | button shows "Looking up…"                                                                                                          |
| no UTXOs                | "No funds at your deposit address yet — fund it via §3 and wait for it to appear."                                                  |
| filled (confirmed)      | green badge + summary                                                                                                               |
| filled (unconfirmed)    | "pending confirmation" note (committee needs confirmations before it approves)                                                      |
| fetch error             | error line via `describeError`                                                                                                      |
| regtest                 | "Auto-fill needs a public explorer; not available on regtest. Enter values manually or set VITE_BTC_RPC_URL for the §3 RPC lookup." |

## Non-destructive

Auto-fill **overwrites** the txid/rows on click (it's an explicit user action on
a button labelled "Auto-fill"). Recipient is only filled when empty, preserving a
manually chosen recipient.

## Testing

The ref-app is **not a workspace test target** (CLAUDE.md) and ships no test
runner, so we do not stand up vitest just for this helper. Instead:

- Keep `lib/mempool.ts` small and pure so it's correct by inspection.
- Typecheck via `pnpm --filter ref-app build` (`tsc --noEmit`).
- Manual: connect dev-wallet on devnet, derive §3 address, fund via
  signet257.bublina.eu.org, click auto-fill, confirm §4 populates, submit.

## Out of scope

- Multi-tx batching in one submit (form is single-txid by design).
- Touching the SDK or its `bitcoin.*` surface.
- Auto-submitting the deposit (user reviews then clicks Submit — chosen for
  step-by-step clarity in the demo).
