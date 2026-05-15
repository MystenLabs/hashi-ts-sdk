# @mysten-incubation/hashi

## 0.1.0

### Minor Changes

- 75fcdca: Fix btcTxid display values to strip the 0x prefix. Add GraphQL-based discovery of pending deposits to transaction history — confirmed requests still read from the on-chain user_requests index; in-flight deposits are discovered via DepositRequestedEvent queries and deduplicated. Bump GET_OBJECTS_BATCH to 500.

## 0.0.2

### Patch Changes

- 9422708: Add a package-level `README.md` so the npm landing page has a real overview (install, one quickstart snippet, link to the repo README for full docs). Also corrects stale `@mysten/hashi` references in the root README to the actual published name `@mysten-incubation/hashi`.
