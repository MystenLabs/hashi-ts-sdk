# ref-app

Local-only reference React app exercising the full user-facing surface of
`@mysten-incubation/hashi` against Sui devnet (BTC signet). It doubles as the **live demo** for the
SolEng "Hashi deep dive".

## Run

From the repo root:

```bash
pnpm install
pnpm --filter ref-app dev
```

Open http://localhost:5173.

## What it demos

| §   | Section                  | SDK surface                                                                                         |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | Protocol status & config | `client.hashi.view.all()`                                                                           |
| 2   | Committee & guardian     | `client.hashi.view.mpcPublicKey()` + guardian config from `view.all()`                              |
| 3   | Deposit address          | `client.hashi.generateDepositAddress(...)` (2-of-2 taproot)                                         |
| 4   | Record a deposit         | `client.hashi.view.findUsedUtxos(...)`, `tx.deposit(...)` + sign, `view.depositStatus(...)` polling |
| 5   | hBTC balance             | `client.hashi.view.balance(owner)`                                                                  |
| 6   | Fees & gas               | `client.hashi.view.depositGasEstimate(...)`, `view.withdrawalFees(...)`                             |
| 7   | Request a withdrawal     | `client.hashi.tx.requestWithdrawal(...)` + sign, `view.withdrawalStatus(...)` polling               |
| 8   | Cancel a withdrawal      | `client.hashi.tx.cancelWithdrawal(...)` + sign                                                      |
| 9   | Transaction history      | `client.hashi.view.transactionHistory(address)`                                                     |
| 10  | Activity log             | (in-memory)                                                                                         |

The deposit/withdrawal status panels poll `view.depositStatus` / `view.withdrawalStatus`; the
imperative one-shot equivalents are `client.hashi.waitForDeposit` / `waitForWithdrawal`.

## Wallet

Uses [`@mysten-incubation/dev-wallet`](https://ts-sdks-incubation.vercel.app/dev-wallet) — a
development-only wallet integrated as a dapp-kit `walletInitializer`. No browser extension required;
the WebCrypto adapter persists keys in IndexedDB. The app composes unsigned `Transaction`s via
`client.hashi.tx.*` and signs them through dapp-kit's `signAndExecuteTransaction` (the realistic dapp
pattern; the `Signer`-based direct methods are for backend/script use).

## Funding the deposit address

The deposit flow needs real signet BTC funding the derived 2-of-2 P2TR address. Use any signet faucet
(e.g. https://signetfaucet.com). After confirmation, paste the funding `txid` (display order — the
form mempool.space shows) and vout(s) into §4. Address derivation (§3) requires the deployment to
have published `guardian_btc_public_key`; until then the SDK throws `HashiConfigError` and the app
shows a "guardian not provisioned" notice.

## Configuration / pointing at a live deployment

By default the app uses the SDK's built-in `NETWORK_CONFIG` for Sui **devnet**. **Sui devnet is reset
periodically**, and when it is, those built-in object/package IDs go stale — reads then fail with
`HashiFetchError` and the app shows a "Can't reach a live Hashi deployment" banner. Point it at a
live deployment (a fresh devnet deploy, or a local `hashi-localnet`) with a `ref-app/.env`:

```bash
# ref-app/.env — all optional; unset values fall back to the SDK's NETWORK_CONFIG
VITE_SUI_NETWORK=devnet                  # devnet | testnet | mainnet | localnet
VITE_SUI_RPC_URL=http://127.0.0.1:9000   # full-node base URL (e.g. for localnet)
VITE_HASHI_OBJECT_ID=0x...               # Hashi shared object id
VITE_HASHI_PACKAGE_ID=0x...              # Hashi package id
VITE_BITCOIN_NETWORK=signet              # mainnet | testnet | signet | regtest
VITE_BTC_RPC_URL=http://...              # optional: enables client.hashi.bitcoin.* (a "find outputs" helper under §3)
```

Restart the dev server after changing `.env`. `VITE_BTC_RPC_URL` is off by default because a browser
calling Bitcoin Core directly hits CORS.

## Scope

This app is **not** part of the published SDK and is not a workspace test target. It exists purely to
exercise the SDK from the dapp side.
