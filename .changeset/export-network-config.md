---
"@mysten-incubation/hashi": minor
---

Export `NETWORK_CONFIG` and `DUST_RELAY_MIN_VALUE` from the package root so consumers can resolve the
deployed Hashi object/package IDs and the dust-relay floor without re-deriving them (used by the
reference app to build the `Coin<BTC>` type tag).
