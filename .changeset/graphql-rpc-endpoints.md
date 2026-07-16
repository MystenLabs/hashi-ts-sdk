---
"@mysten-incubation/hashi": patch
---

Point default GraphQL URLs at the dedicated graphql.<network>.sui.io hosts. The fullnode-served /graphql endpoints are being retired — testnet already returns 404, which silently emptied the pending-request portion of `view.transactionHistory`. That failure now also logs a console warning instead of being swallowed.
