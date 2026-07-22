# Hashi TypeScript SDK

TypeScript SDK for interacting with the Hashi Sui Move smart contracts.

**This repository is no longer active.** The SDK graduated to [`MystenLabs/ts-sdks`](https://github.com/MystenLabs/ts-sdks/tree/main/packages/hashi); development continues there. This repo is kept for historical reference.

## Structure

This repo is a pnpm workspace. The SDK lives in `packages/hashi/` so it can be lifted into [`MystenLabs/ts-sdks`](https://github.com/MystenLabs/ts-sdks) at graduation with no path rewrites.

### Workspace root

- `package.json` — workspace root (private, never published). Owns shared scripts (`build`, `test`, `lint`, `release`, `changeset-version`) and dev tools (`@changesets/cli`, `tsdown`, `turbo`, `prettier`, `typescript`).
- `pnpm-workspace.yaml` — declares `packages/**`; sets `minimumReleaseAge: 2880` (supply-chain guard).
- `tsconfig.shared.json` — shared TS compiler options; package `tsconfig.json`s extend it.
- `turbo.json` — task graph for `build`, `test`, `lint`.
- `.changeset/` — changeset config + pending changeset markdown files (release flow).
- `RELEASING.md` — how to cut a release (changeset workflow, first-time setup, OIDC trusted publisher).
- `sonar-project.properties` — SonarQube configuration; sources/coverage paths point into `packages/hashi/`.
- `.github/workflows/` — CI:
  - `lint.yml`, `test.yml`, `sonarqube.yml` — formatting / unit tests / coverage on push/PR to `main`. SonarQube skips Dependabot-triggered runs (no access to `SONAR_TOKEN`).
  - `integration.yml` — full hashi-localnet stack (Sui localnet + BTC regtest + N validators with DKG) on push/PR to `main`, gated by a `paths` filter so it only fires when `packages/hashi/**`, the `hashi` submodule, `pnpm-lock.yaml`, or the workflow itself changes (SEDEFI-262); see SEDEFI-183 for the localnet design.
  - `changesets.yml` — push-to-main: opens "Version Packages" PR or publishes via OIDC.
  - `changesets-ci.yml`, `changesets-ci-comment.yml` — PR-time changeset enforcement (the butterfly comment).
- `hashi/` — git submodule ([MystenLabs/hashi](https://github.com/MystenLabs/hashi)); contains `packages/` with Sui Move contracts and `crates/e2e-tests` whose `hashi-localnet` Rust binary is built and run by the integration workflow. Goes away once Hashi contracts are on MVR.

### `packages/hashi/`

- `package.json` — name: `@mysten-incubation/hashi`, version: `0.0.1`, license: Apache-2.0. Publishes to npm via OIDC trusted publisher (no `NPM_TOKEN`).
- `tsconfig.json` — extends `../../tsconfig.shared.json`; overrides `composite/declaration/declarationMap: false` so tsdown owns declaration emit.
- `tsdown.config.ts` — single-entry ESM config; `dts: true`, `unbundle: true` (preserves source structure).
- `vitest.config.mts` — unit + integration projects; loads `.env` for integration tests.
- `sui-codegen.config.ts` — codegen config (`path: "../../hashi/packages/hashi"` resolves to the submodule).
- `src/` — SDK source code (TypeScript)
  - `client.ts` — `HashiClient` class (via `$extend` pattern); direct methods (`deposit`, `requestWithdrawal`, `cancelWithdrawal` — all sign + execute), plus `generateDepositAddress`, `waitForDeposit`/`waitForWithdrawal` (polling), `view.*` (governance config, `balance`, `depositStatus`/`withdrawalStatus`, `transactionHistory`, `findUsedUtxos`, `depositGasEstimate`/`withdrawalFees`, `mpcPublicKey`), `bitcoin.*` (BTC RPC lookups — requires `btcRpcUrl`), `tx.*`, `call.*`
  - `bitcoin.ts` — Bitcoin address derivation and bech32/bech32m decoding (`bitcoinAddressToWitnessProgram`)
  - `constants.ts` — `NETWORK_CONFIG` (Hashi object/package ids and default BTC network per Sui network)
  - `errors.ts` — typed SDK errors (`HashiConfigError`, `HashiFetchError`, `HashiPausedError`, `AmountBelowMinimumError`, `InvalidParamsError`, `InvalidBitcoinAddressError`)
  - `types.ts` — public types (`DepositParams`, `WithdrawalParams`, `CancelWithdrawalParams`, `UtxoOutput`, `UtxoId`, `UtxoUsageResult`, `TransactionHistoryItem`, `DepositHistoryItem`, `WithdrawalHistoryItem`, `WithdrawalStatus`, `GovernanceConfig`, network/option shapes)
  - `util.ts` — internal helpers (`assertHex32` hex validation, `entry`/`configBytes` for VecMap decoding, `reverseTxidBytes`)
  - `index.ts` — public exports
  - `contracts/` — auto-generated Move bindings (`@mysten/codegen`); do not edit
- `test/` — unit and integration tests (vitest)
  - `test/integration/_env.ts` — shared helper (`makeClient`, `makeSigner`, `isLocalnet`, `localnetCli`, `btcRpc`, `fundDepositOnLocalnet`, `waitForCoinBalance`); tests use it to stay byte-identical between devnet and localnet targets.
- `CHANGELOG.md`, `LICENSE` — included in published tarball.

## Commands

Two surfaces depending on where you run them.

### From workspace root (works anywhere)

- `pnpm test` — unit tests via turbo → vitest
- `pnpm build` — typecheck + tsdown bundle (writes `packages/hashi/dist/`)
- `pnpm lint` / `pnpm lint:fix` — prettier check / write
- `pnpm changeset` — create a changeset to describe a release-worthy change
- `pnpm release` — build all packages, then `changeset publish` (used by CI; not normally invoked locally)

### Package-only (`pnpm --filter @mysten-incubation/hashi <cmd>` from root, or `cd packages/hashi`)

- `test:integration` — integration tests; defaults to Sui devnet, switches to a local hashi-localnet stack when `HASHI_E2E_SUI_NETWORK=localnet` and the related `HASHI_E2E_*` env vars are set (the `integration.yml` CI workflow exports them automatically; locally, run `hashi/target/release/hashi-localnet start --data-dir .hashi/localnet` first and source state.json)
- `coverage` — unit tests with v8 coverage (writes `packages/hashi/coverage/lcov.info` for SonarQube)
- `codegen` — regenerate TypeScript bindings from Move contracts under `src/contracts/`
- `format` — format the package's TS/JSON/MD files with prettier

## Dependencies

- `@mysten/sui`, `@mysten/bcs`, `@mysten/codegen` — peer dependencies (Sui SDK)
- `@noble/curves`, `@noble/hashes` — secp256k1 point math and SHA3-HKDF for key derivation
- `@scure/base` — bech32m encoding for taproot addresses

## Networks

Sui **devnet** and **testnet** are wired up (`packages/hashi/src/constants.ts`); BTC defaults to **signet** on both. Devnet support is **temporary** and will be deprecated in favor of:

- **testnet** — for end-to-end testing of SDK consumers (and our own real-network tests).
- **mainnet** — for production DeFi consumers using the SDK against live BTC. Not yet deployed.

Update `NETWORK_CONFIG` in `packages/hashi/src/constants.ts` when the mainnet deployment lands.

## Bitcoin Address Scheme

Each Sui address maps to a unique P2TR (Pay-to-Taproot) Bitcoin deposit address — a 2-of-2 taproot script-path output co-controlled by the MPC committee and the guardian. The MPC child-key derivation replicates `fastcrypto_tbls::threshold_schnorr::key_derivation::derive_verifying_key`:

1. Read the MPC committee master key (`CommitteeSet.mpc_public_key`, 33-byte compressed secp256k1) and the guardian's x-only BTC key (`guardian_btc_public_key` config) from on-chain
2. Derive child key: `HKDF-SHA3-256(ikm = parent_x ‖ sui_address, len=64) mod n` → `child = parent + tweak × G`
3. Build taproot address: `tr(NUMS, {multi_a(2, guardian, child), and_v(v:older(delay), pk(child))})` — normal spends need both guardian and MPC-derived child signatures; the delayed recovery leaf lets the MPC child spend alone after the BIP-68 timelock. Mandatory on every network; `generateDepositAddress` throws until the deployment publishes `guardian_btc_public_key`.

See https://mystenlabs.github.io/hashi/design/address-scheme.html

## Conventions

- Keep this file short and up to date as the SDK evolves.
- **Keep `README.md` up to date.** On every PR, check whether the root `README.md` (and `packages/hashi/README.md`, which ships in the npm tarball) still matches the SDK — install instructions, network support, API surface, examples. Don't let either README go stale.
- **Every PR ends with a changeset.** Run `pnpm changeset` (interactive picker) or hand-write a `.changeset/<slug>.md` file with the bump frontmatter (`"@mysten-incubation/hashi": patch|minor|major`) followed by a one-line summary. Without one, `changesets-ci-comment.yml` flags the PR (the butterfly comment) and the release workflow won't publish the change to npm — so omitting it silently prevents the work from ever reaching consumers.
- `@noble/*` and `@scure/*` imports require `.js` extensions (`@noble/curves/secp256k1.js`) due to `moduleResolution: NodeNext`.
- Do not edit files under `packages/hashi/src/contracts/` — they are auto-generated by codegen.
- **This SDK is user-facing only.** `call.*`, `tx.*`, and the direct methods expose only actions an end user performs (deposit, withdraw, cancel). Do not add wrappers for operator/committee/relayer calls (e.g. `approveDeposit`, `confirmDeposit`, `approveRequest`, `commitWithdrawalTx`, `signWithdrawal`, `confirmWithdrawal`, `deleteExpiredDeposit`, `allocatePresigsForWithdrawalTxn`) — operator tooling can import the generated bindings under `packages/hashi/src/contracts/hashi/` directly.
- **BTC txids passed to `client.hashi.deposit()` are display order** (the form mempool.space, blockstream.info, and `bitcoin-cli` show). The SDK reverses to internal byte order via `reverseTxidBytes` in `packages/hashi/src/util.ts` before recording on-chain, because the committee verifier reads `Utxo.txid` as a `bitcoin::Txid` (internal/little-endian). Recording display-order bytes leaves the committee searching for a phantom byte-reversed tx and the deposit silently never confirms — see SEDEFI-190.
- **Integration tests have two targets — devnet (default) and localnet (CI).** Both run through the same test files in `packages/hashi/test/integration/`; only env vars differ. Adding a new integration test should reuse `_env.ts` helpers so it works on both targets without duplication. Localnet-only flows that depend on the committee actually minting hBTC (real deposit/withdrawal lifecycles) gate themselves with `describe.skipIf(!isLocalnet())`.
