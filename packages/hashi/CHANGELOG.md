# @mysten-incubation/hashi

## 0.3.1

### Patch Changes

- 0af8dfa: Derive Bitcoin deposit addresses with Hashi's delayed MPC recovery taproot leaf.

## 0.3.0

### Minor Changes

- ced85d2: Derive deposit addresses as 2-of-2 (guardian, MPC-child) taproot to match the on-chain bridge (hashi#609). `generateDepositAddress` (pure helper) now takes a named-args object including `guardianBtcXOnly`; `HashiClient.generateDepositAddress` reads the guardian key from on-chain and fails fast with `HashiConfigError` when the deployment is not guardian-provisioned. `GovernanceConfig` gains `guardianUrl`, `guardianPublicKey`, `guardianBtcPublicKey`. Adds `twoOfTwoTaprootScriptPathAddress` as a public primitive and removes the single-key `taprootScriptPathAddress` helper, which the bridge no longer accepts.

## 0.2.0

### Minor Changes

- 5f9f592: Surface deposit time delay: add `bitcoinDepositTimeDelayMs` to `GovernanceConfig`, `approvalTimestampMs` and `confirmableAtMs` to `DepositInfo`, and `confirmableAtMs` to `DepositHistoryItem`

## 0.1.1

### Patch Changes

- 5b3389e: Update README install instructions to use the published npm package
- 72b6efc: Expand README to document the status, balance, history, fee, polling, and Bitcoin RPC APIs

## 0.1.0

### Minor Changes

- 75fcdca: Fix btcTxid display values to strip the 0x prefix. Add GraphQL-based discovery of pending deposits to transaction history — confirmed requests still read from the on-chain user_requests index; in-flight deposits are discovered via DepositRequestedEvent queries and deduplicated. Bump GET_OBJECTS_BATCH to 500.

## 0.0.2

### Patch Changes

- 9422708: Add a package-level `README.md` so the npm landing page has a real overview (install, one quickstart snippet, link to the repo README for full docs). Also corrects stale `@mysten/hashi` references in the root README to the actual published name `@mysten-incubation/hashi`.
