# Hashi SDK Reference App — Design

**Date:** 2026-05-11
**Status:** Draft → awaiting user review
**Owner:** nikos.kitmeridis@mystenlabs.com

## Goal

A minimal local React app under `/ref-app` that exercises every user-facing surface of `@mysten-incubation/hashi` against Sui devnet (BTC signet). Primary purpose: let the SDK author drive every method by hand to evaluate the public API, surface ergonomic gaps, and build intuition for Hashi's deposit/withdraw lifecycle.

Non-goals: production polish, multi-network support, automated tests, CI integration, publishing. The app stays local-only and never enters CI or release flows.

## Non-negotiables

- Workspace member at top-level `/ref-app` (added to `pnpm-workspace.yaml`); depends on `@mysten-incubation/hashi` via `workspace:*`. Sits outside `packages/` to avoid being lifted into `MystenLabs/ts-sdks`.
- Latest `@mysten/*` (Sui v2 / dapp-kit-react) — `createDAppKit` + `<DAppKitProvider>`, `SuiGrpcClient`, `useDAppKit().signAndExecuteTransaction(...)`, `client.core.*` reads.
- Wallet: `@mysten-incubation/dev-wallet` with `WebCryptoSignerAdapter` (no browser extension required, key persisted in IndexedDB).
- All four user-facing SDK methods exercised end-to-end: `generateDepositAddress`, `view.all`, `tx.deposit` + sign, `tx.requestWithdrawal` + sign, `tx.cancelWithdrawal` + sign.
- Bare-bones styling — single `App.css`, no UI library.
- Manual refresh buttons on reads (no polling).

## Architecture

### Stack

- **Build:** Vite + React + TypeScript. `tsconfig.json` extends the workspace `tsconfig.shared.json`.
- **Sui:** `@mysten/sui` (peer aligns with the SDK's `^2.14.1`), `SuiGrpcClient`.
- **Dapp-kit:** `@mysten/dapp-kit-react` (v2 — Lit-based `ConnectButton`, `DAppKitProvider`, `useDAppKit` / `useCurrentClient` / `useCurrentAccount` / `useWalletConnection` hooks).
- **Wallet:** `@mysten-incubation/dev-wallet` + `WebCryptoSignerAdapter`, configured via `walletInitializers` on `createDAppKit`.
- **State:** `@tanstack/react-query` (peer of dapp-kit) for reads + mutations.
- **SDK:** `@mysten-incubation/hashi` via `workspace:*`, attached to the gRPC client with `$extend(hashi({ network: "devnet" }))`.

### Why `tx.*` and not direct methods

The SDK's direct methods (`hashiClient.hashi.deposit(...)`) require a `Signer` instance (e.g. `Ed25519Keypair`). Dapp-kit wallets — including dev-wallet — do not expose a `Signer`; they expose `dAppKit.signAndExecuteTransaction({ transaction })`. The ref app therefore composes unsigned `Transaction` objects via `hashiClient.hashi.tx.*` and signs through dapp-kit. This is the realistic dapp pattern; the `Signer`-based surface is for backend/script use cases and is out of scope here.

### Top-level layout

Single page, scroll-down sections. No router, no tabs.

```
┌──────────────────────────────────────────────────────┐
│  Hashi SDK Reference App      <ConnectButton/>       │
├──────────────────────────────────────────────────────┤
│ § 1  Governance snapshot         [Refresh]           │
│ § 2  Your deposit address        [Refresh]           │
│ § 3  Record a deposit            (form + Submit)     │
│ § 4  Your hBTC balance           [Refresh]           │
│ § 5  Request a withdrawal        (form + Submit)     │
│ § 6  Cancel a withdrawal         (form + Submit)     │
│ § 7  Activity log                (last 10 results)   │
└──────────────────────────────────────────────────────┘
```

Each interactive section renders a "Calls `client.hashi.<fn>(...)`" caption above its form so the UI maps directly to SDK calls.

### File layout

```
ref-app/
├── package.json          private:true; vite + react + dapp-kit-react + dev-wallet + workspace:* hashi
├── tsconfig.json         extends ../tsconfig.shared.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx          providers: QueryClientProvider → DAppKitProvider → App
    ├── App.tsx           top bar + sections
    ├── App.css           ~50 lines vanilla
    ├── dappkit.ts        createDAppKit + dev-wallet initializer
    ├── lib/
    │   ├── hashi.ts      useHashiClient() — memoizes client.$extend(hashi(...))
    │   └── btc-type.ts   resolves the Coin<BTC> type tag for balance reads
    └── sections/
        ├── GovernanceSection.tsx
        ├── DepositAddressSection.tsx
        ├── RecordDepositSection.tsx
        ├── BalanceSection.tsx
        ├── RequestWithdrawalSection.tsx
        ├── CancelWithdrawalSection.tsx
        └── ActivityLog.tsx
```

## Components

### `dappkit.ts` — single source of truth

```ts
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
```

### `lib/hashi.ts` — Hashi client hook

```ts
import { useCurrentClient } from "@mysten/dapp-kit-react";
import { hashi } from "@mysten-incubation/hashi";
import { useMemo } from "react";

export function useHashiClient() {
  const client = useCurrentClient();
  return useMemo(() => client.$extend(hashi({ network: "devnet" })), [client]);
}
```

### Section behaviors

| Section                   | Read source                                                                                                       | Mutation                                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Governance**         | `useQuery(['hashi','view'], () => hashiClient.hashi.view.all())` + manual refetch                                 | —                                                                                                                                                                                        |
| **2. Deposit address**    | `useQuery(['hashi','depositAddr', addr], () => hashiClient.hashi.generateDepositAddress({ suiAddress: addr }))`   | —                                                                                                                                                                                        |
| **3. Record deposit**     | —                                                                                                                 | `useMutation` → builds `hashiClient.hashi.tx.deposit({ txid, utxos, recipient })` → `dAppKit.signAndExecuteTransaction({ transaction })`. Reads `DepositRequestedEvent` from the result. |
| **4. hBTC balance**       | `useQuery(['balance', addr], () => client.core.getBalance({ owner: addr, coinType: BTC_TYPE }))` + manual refresh | —                                                                                                                                                                                        |
| **5. Request withdrawal** | —                                                                                                                 | `useMutation` → `tx.requestWithdrawal({ amount, bitcoinAddress: program })` → sign & execute. Pulls `request_id` from `WithdrawalRequestedEvent` and copies it into Section 6's input.   |
| **6. Cancel withdrawal**  | —                                                                                                                 | `useMutation` → `tx.cancelWithdrawal({ requestId, recipient: addr })` → sign & execute.                                                                                                  |
| **7. Activity log**       | in-memory `useReducer` array                                                                                      | every mutation pushes `{ ts, kind, digest, eventSummary, error? }`                                                                                                                       |

### Section 2/3 details — Bitcoin funding loop

Section 2 (Deposit address) renders:

- The derived P2TR signet address (large, monospace) with a copy-to-clipboard button.
- A link to the address on `mempool.space/signet/address/<addr>`.
- A short copy block: "Send signet BTC to this address from any wallet/faucet (e.g. signetfaucet.com), wait for it to confirm, then record the funding tx in Section 3 below."

Section 3 (Record deposit) renders a form with:

- `txid` text input (display order, 0x-prefixed) — placeholder `"0x..."`.
- A dynamic list of `(vout, amountSats)` rows with an "Add output" button (since one funding tx may pay the deposit address on multiple outputs).
- `recipient` input pre-filled from `useCurrentAccount()`, editable.
- Submit button → builds `tx.deposit(...)`, signs via dapp-kit, displays the resulting digest + `DepositRequestedEvent`(s) inline + pushes to activity log.

### Section 4 — hBTC balance

`BTC_TYPE` is computed once as `` `${packageId}::btc::BTC` ``. The SDK currently exports `NETWORK_CONFIG` indirectly via `constants.ts` but does **not** re-export it from `index.ts`. The cleanest fix is a small SDK addition: re-export `NETWORK_CONFIG` (and the `DUST_RELAY_MIN_VALUE` constant) so the ref app and other consumers can read the resolved package id without re-deriving it. If we don't want to touch the SDK, the ref app falls back to the same hardcoded `packageId` the SDK uses internally, and we note the gap in the SDK ergonomics findings.

**Decision:** add `export { NETWORK_CONFIG } from "./constants.js";` to `packages/hashi/src/index.ts` as part of this work. Tiny diff, clean fix.

### Section 5 details — withdrawal address validation

The form decodes the user's `bitcoinAddress` input client-side via the SDK's exported `bitcoinAddressToWitnessProgram`. This gives us the same typed `InvalidBitcoinAddressError` the direct methods would throw, with a structured `code` (`"bech32_decode_failed"`, `"hrp_mismatch"`, etc.) we can render inline. On success, the form passes the raw witness program bytes to `tx.requestWithdrawal`.

`amountSats` validation is left to the on-chain side via the SDK's preflight (`AmountBelowMinimumError`). The form does not duplicate the minimum check — it surfaces the typed error from the failed mutation.

### Section 7 — Activity log

In-memory `useReducer` ring buffer (length 10). Each entry:

```ts
type ActivityEntry = {
  ts: number;
  kind: "deposit" | "withdrawal-request" | "withdrawal-cancel";
  status: "pending" | "success" | "failed";
  digest?: string; // tx digest if available
  events?: string[]; // formatted event summaries
  error?: string; // typed error name + message
};
```

Each row renders the digest as a link to `https://suiscan.xyz/devnet/tx/<digest>`. No persistence — refreshing the page clears the log (acceptable for a local ref app).

## Data flow

1. User opens `localhost:5173`. Dev-wallet auto-connects (creates a key on first run, persists in IndexedDB).
2. Section 1 fires `view.all()`, displays `paused` flag, both minimums, confirmation threshold, cancellation cooldown.
3. Section 2 fires `generateDepositAddress({ suiAddress: account.address })` once the account is known. Renders the address.
4. User funds the address from a signet faucet/wallet out-of-band, waits for confirmation, copies the txid + vout from mempool.space.
5. User pastes into Section 3 and submits. App builds `tx.deposit`, calls `dAppKit.signAndExecuteTransaction`, surfaces `DepositRequestedEvent` and pushes to activity log.
6. After `bitcoinConfirmationThreshold` blocks, the committee mints `hBTC`. User clicks Refresh in Section 4 — balance updates.
7. User submits Section 5 with a destination signet bech32(m) address + amount. App pulls `request_id` from `WithdrawalRequestedEvent` and pre-fills Section 6.
8. (Optional) User submits Section 6 to cancel. Will fail with the on-chain cooldown error if too soon — surfaced inline as the activity log entry.

## Error handling

- All mutations are wrapped in `useMutation`; the `onError` handler pushes a failed entry to the activity log AND the section displays the error inline next to its form.
- Typed SDK errors (`InvalidBitcoinAddressError`, `AmountBelowMinimumError`, `HashiPausedError`, `InvalidParamsError`, `HashiFetchError`, `HashiConfigError`) are caught with `instanceof` and rendered as `${error.constructor.name}: ${error.message}` plus relevant structured fields (e.g. `code` for the address error, `violations` for the amount error).
- Wallet rejection (`signAndExecuteTransaction` rejected by user) is detected by message and rendered as a neutral "User cancelled".
- Unknown errors fall through to a generic "Unexpected error: <message>".

## Workspace integration

- Add `"ref-app"` to `pnpm-workspace.yaml` packages list.
- `ref-app/package.json` declares `"private": true` and `"@mysten-incubation/hashi": "workspace:*"` so changes to the SDK source are picked up on next dev-server reload.
- No turbo task wiring — keep it out of `pnpm test` / `pnpm build` at the workspace root. Run via `pnpm --filter ref-app dev`.
- No CI workflow.

## SDK changes (in scope, minimal)

1. `packages/hashi/src/index.ts` — re-export `NETWORK_CONFIG` from `./constants.js`. Lets the ref app (and any consumer) access the resolved `packageId` for type-tag construction.

That's the full SDK delta. Anything else surfaced during implementation gets recorded as a finding but stays out of this spec's scope.

## Out of scope

- Tests for the ref app.
- Mainnet/testnet support (those network configs aren't wired in the SDK yet).
- Auto-funding the address via a faucet API.
- Persisting the activity log.
- Tracking withdrawal status post-request (e.g. `Approved`, `Committed`, `Confirmed` transitions). The SDK doesn't expose a status reader and adding one is a separate piece of work.
- Direct-method (`Signer`-based) demonstration. A separate Node script could fill that gap if useful — out of scope here.

## Open questions

None — all clarifications resolved during brainstorming:

- Signing: dapp-kit + dev-wallet (`tx.*` builders, not `Signer` direct methods). ✓
- Features: all 4 user-facing methods + `view.all` + `generateDepositAddress`. ✓
- BTC handling: manual fund + paste txid form. ✓
- Location: top-level `/ref-app`. ✓
- Polish: bare-bones single CSS file. ✓
