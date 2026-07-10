---
"@mysten-incubation/hashi": patch
---

Track the redeployed devnet contracts: regenerate bindings against hashi `7e4caeb2` (`config_value::Value` gained `U128`/`U256`, shifting the BCS tags the SDK decodes the on-chain config with), follow the `DepositRequested`/`WithdrawalRequested` event renames and request-object field renames, and point `NETWORK_CONFIG.devnet` at the new package and Hashi object.
