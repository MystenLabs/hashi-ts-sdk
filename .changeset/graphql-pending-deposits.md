---
"@mysten-incubation/hashi": minor
---

Add GraphQL-based discovery of pending deposits to transaction history. Confirmed requests still read from the on-chain user_requests index; in-flight deposits are discovered via DepositRequestedEvent queries and deduplicated. Bump GET_OBJECTS_BATCH to 500.
