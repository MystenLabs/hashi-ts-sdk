---
"@mysten-incubation/hashi": minor
---

Derive deposit addresses as 2-of-2 (guardian, MPC-child) taproot to match the on-chain bridge (hashi#609). `generateDepositAddress` (pure helper) now takes a named-args object including `guardianBtcXOnly`; `HashiClient.generateDepositAddress` reads the guardian key from on-chain and fails fast with `HashiConfigError` when the deployment is not guardian-provisioned. `GovernanceConfig` gains `guardianUrl`, `guardianPublicKey`, `guardianBtcPublicKey`. Adds `twoOfTwoTaprootScriptPathAddress` as a public primitive and removes the single-key `taprootScriptPathAddress` helper, which the bridge no longer accepts.
