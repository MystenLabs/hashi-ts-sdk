---
"@mysten-incubation/hashi": minor
---

Derive deposit addresses as 2-of-2 (guardian, MPC-child) taproot to match the on-chain bridge (hashi#604). `generateDepositAddress` (pure helper) now takes a named-args object including `guardianBtcXOnly`; `HashiClient.generateDepositAddress` fetches the guardian key from on-chain and fails fast with `HashiConfigError` when the deployment is not guardian-provisioned. `GovernanceConfig` gains `guardianUrl`, `guardianPublicKey`, `guardianBtcPublicKey`. Single-key deposit addresses are no longer supported by the bridge and the SDK no longer produces them. Adds `twoOfTwoTaprootScriptPathAddress` as a public primitive.
