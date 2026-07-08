---
"@mysten-incubation/hashi": minor
---

feat: add a `client.hashi.guardian.*` namespace (`info`, `limiterStatus`, `canWithdraw`) that reads the guardian's rate-limiter headroom from its read-only `/info` endpoint, resolving the guardian URL from `guardianUrl`, a `guardianInfoProvider`, or the on-chain `guardian_url` config
