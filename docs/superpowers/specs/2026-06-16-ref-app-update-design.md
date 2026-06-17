# Hashi Reference App — v2 Update (full SDK surface + demo polish)

**Date:** 2026-06-16
**Status:** Approved (scope sign-off) → implementing
**Owner:** nikos.kitmeridis@mystenlabs.com
**Supersedes/extends:** `2026-05-11-ref-app-design.md`

## Why

The SDK grew substantially (rebase onto `origin/main`, +16 commits): deposit time-delay /
`confirmableAtMs`, `view.balance`, `view.depositStatus` / `withdrawalStatus`,
`view.transactionHistory`, `view.findUsedUtxos`, `view.depositGasEstimate` / `withdrawalFees`,
`view.mpcPublicKey`, `waitForDeposit` / `waitForWithdrawal` polling, `bitcoin.*` RPC, and the
mandatory **timelock guardian taproot** deposit address (immediate 2-of-2 + delayed MPC recovery). The ref-app must (a) exercise the _full_
current surface and (b) be presentation-ready as the **live demo for SOLENG-641** (SolEng "Hashi
deep dive"). "Include everything everywhere" — reads _and_ actions.

## Non-goals

Production polish, multi-network, automated tests, CI, publishing. Stays local-only, devnet (BTC
signet), dapp-kit + dev-wallet, `tx.*` builders signed via `signAndExecuteTransaction`.

## Section layout (single page, scroll)

| §   | Section                                   | SDK surface                                                                                                                                                                                                                                                | SOLENG-641 category                                     |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **Protocol status & config** (Governance) | `view.all()` → paused, chainId, deposit/withdrawal minimums, confirmation threshold, **deposit time-delay**, cancellation cooldown, worst-case network fee                                                                                                 | 1 Protocol Status, 2 Config, 5 Governance Observability |
| 2   | **Committee & guardian** _(new)_          | `view.mpcPublicKey()` (33-byte compressed secp256k1), guardian provisioning from `view.all()` (`guardianBtcPublicKey` set?, `guardianUrl`, `guardianPublicKey`)                                                                                            | 3 Committee Info                                        |
| 3   | **Deposit address**                       | `generateDepositAddress({ suiAddress })` — labelled as a timelock taproot tree (immediate 2-of-2 + delayed MPC recovery); **graceful `HashiConfigError`** state when guardian unprovisioned. Optional `bitcoin.lookupAllVouts` when `VITE_BTC_RPC_URL` set | 4 Deposit Address Derivation                            |
| 4   | **Record deposit**                        | pre-check `view.findUsedUtxos`; `tx.deposit` + sign; inline **status tracker** (`view.depositStatus` polling + `waitForDeposit`) with `confirmableAtMs` countdown                                                                                          | actions + status polling                                |
| 5   | **hBTC balance**                          | `view.balance(owner)` → `totalBalance` + `coinObjectCount`                                                                                                                                                                                                 | reads                                                   |
| 6   | **Fees** _(new)_                          | `view.depositGasEstimate(sender)` + `view.withdrawalFees(sender)` → gas (MIST), worst-case network fee, withdrawal minimum                                                                                                                                 | reads                                                   |
| 7   | **Request withdrawal**                    | `tx.requestWithdrawal` + sign; inline status tracker (`view.withdrawalStatus` polling) → Requested→Approved→Processing→Signed→Confirmed + `btcTxid`                                                                                                        | actions + status polling                                |
| 8   | **Cancel withdrawal**                     | `tx.cancelWithdrawal` + sign                                                                                                                                                                                                                               | actions                                                 |
| 9   | **Transaction history** _(new)_           | `view.transactionHistory(address)` → unified deposit+withdrawal list w/ status badges                                                                                                                                                                      | reads                                                   |
| 10  | **Activity log**                          | in-memory ring buffer (kept)                                                                                                                                                                                                                               | —                                                       |

A top **demo guide** box numbers the happy path (connect → derive address → fund on signet → record
deposit → track to confirmed → balance → withdraw → track → cancel).

## Foundation changes

- `lib/hashi.ts` — pass `btcRpcUrl: VITE_BTC_RPC_URL` into `hashi({...})`; export `BTC_RPC_URL`.
- `lib/format.ts` — add `hex`, `whenMs` (timestamp), `untilMs` (countdown), `mist`.
- `lib/poll.ts` _(new)_ — `useDepositStatus(digest)` / `useWithdrawalStatus(digest)`: `useQuery` with
  `refetchInterval` that stops at terminal state. Captions show the imperative `waitForDeposit` /
  `waitForWithdrawal` equivalent.
- `src/vite-env.d.ts` _(new)_ — `/// <reference types="vite/client" />` for `import.meta.env`.
- `App.css` — restyle: numbered section headers, status badges, demo-guide + callout boxes.
- `App.tsx` — new section order; keeps `requestId` shared state (withdrawal → cancel). Status
  trackers live inline in their action sections (no cross-section coupling).

## Resilience (devnet is a moving target)

Every read renders an explicit empty/error state. `generateDepositAddress` may throw
`HashiConfigError` (guardian unprovisioned) — render a labelled "guardian not provisioned on this
deployment" callout, not a raw stack. `view.mpcPublicKey()` may throw pre-DKG — same treatment.
BTC RPC is **off unless `VITE_BTC_RPC_URL` is set** (browser→Bitcoin-Core CORS), with a note.

## Out of scope

Tests, mainnet/testnet, faucet automation, activity-log persistence, operator/committee calls.
