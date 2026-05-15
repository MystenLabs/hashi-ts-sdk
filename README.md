# @mysten-incubation/hashi

[![npm version](https://img.shields.io/npm/v/@mysten-incubation/hashi.svg)](https://www.npmjs.com/package/@mysten-incubation/hashi)
[![Test](https://github.com/MystenLabs/hashi-ts-sdk/actions/workflows/test.yml/badge.svg)](https://github.com/MystenLabs/hashi-ts-sdk/actions/workflows/test.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

TypeScript SDK for the [Hashi](https://github.com/MystenLabs/hashi) protocol — a Sui Move bridge that mints `hBTC` against Bitcoin deposits and burns it on withdrawal back to BTC.

> [!WARNING]
> **Not production-ready.** This SDK is pre-1.0 and under active development. The API may change without notice and only Sui devnet is wired up. Do not use it in production environments yet.

End-user actions only: **deposit**, **request withdrawal**, **cancel withdrawal**. Operator/committee/relayer calls are intentionally not part of this surface — those tools should import the generated bindings under `src/contracts/hashi/` directly.

## Install

```bash
pnpm add @mysten-incubation/hashi @mysten/sui
```

`@mysten/sui` is a peer dependency.

## Setup

The SDK attaches to any Sui client via `$extend`. After extension, every Hashi method lives under `client.hashi.*`.

```ts
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { hashi } from "@mysten-incubation/hashi";

const client = new SuiGrpcClient({
  network: "devnet",
  baseUrl: "https://fullnode.devnet.sui.io:443",
}).$extend(hashi({ network: "devnet" }));

const signer = Ed25519Keypair.fromSecretKey(/* … */);
```

> **Network support.** Only Sui **devnet** is currently wired up (Bitcoin **signet** by default). Testnet and mainnet are not yet deployed; `hashi({ network: "testnet" })` will throw until those land. To target a custom or local deployment, pass `hashiObjectId`, `packageId`, and `bitcoinNetwork` explicitly.

## Quickstart: Deposit BTC → mint hBTC

1. Derive the unique P2TR Bitcoin deposit address for your Sui address.
2. Send BTC to that address from any wallet.
3. Submit the funding `txid` + `vout` to Hashi for committee confirmation.

The committee watches the Bitcoin chain, confirms the funding tx after `bitcoinConfirmationThreshold` blocks, and mints `hBTC` to the `recipient` address.

```ts
const recipient = signer.toSuiAddress();

// 1. Get the deposit address.
const btcAddress = await client.hashi.generateDepositAddress({
  suiAddress: recipient,
});

// 2. Send BTC to `btcAddress` from any wallet, then collect the
//    funding tx's display-order txid and the vout that paid the
//    deposit address. (Display-order = the form mempool.space and
//    `bitcoin-cli` show — the SDK reverses internally.)

// 3. Record the deposit on Sui.
const result = await client.hashi.deposit({
  signer,
  txid: "0x<64-hex display-order txid>",
  utxos: [{ vout: 0, amountSats: 100_000n }],
  recipient,
});

if (result.$kind !== "Transaction") {
  throw new Error(`deposit failed: ${JSON.stringify(result.FailedTransaction)}`);
}
// `hBTC` lands in `recipient`'s balance once the committee confirms.
```

A single funding tx may pay the deposit address on multiple outputs — pass them all in `utxos` and they're batched into one atomic Sui PTB.

## Quickstart: Request withdrawal (burn hBTC → receive BTC)

Burns `amountSats` of `hBTC` from the signer's balance and enqueues a request for the committee to send BTC to `bitcoinAddress`. The address is decoded client-side as bech32 (P2WPKH) or bech32m (P2TR) and must match the client's configured Bitcoin network.

```ts
const result = await client.hashi.requestWithdrawal({
  signer,
  amountSats: 50_000n,
  bitcoinAddress: "tb1q…", // P2WPKH on signet/testnet, or `tb1p…` for P2TR
});

if (result.$kind !== "Transaction") {
  throw new Error(`request failed: ${JSON.stringify(result.FailedTransaction)}`);
}

// Pull the request id out of the WithdrawalRequestedEvent — needed if
// you later want to cancel.
const evt = result.Transaction.events?.find((e) =>
  e.eventType.endsWith("::withdrawal_queue::WithdrawalRequestedEvent"),
);
const requestId = (evt as { json?: { request_id?: string } } | undefined)?.json?.request_id;
```

## Quickstart: Cancel a pending withdrawal

Returns the locked `hBTC` to the signer. Only the original requester can cancel, only while the request is still `Requested` or `Approved` (not after committee commitment), and only after `withdrawalCancellationCooldownMs` has elapsed since the request. All three are enforced on-chain.

```ts
await client.hashi.cancelWithdrawal({ signer, requestId });
```

## Reading governance state

Every protocol parameter the SDK enforces client-side (pause flag, deposit/withdrawal minimums, confirmation threshold, cooldown) is exposed under `client.hashi.view`. Prefer `view.all()` when you need 2+ values — single round-trip, internally consistent snapshot.

```ts
const snap = await client.hashi.view.all();
// { paused, bitcoinDepositMinimum, bitcoinWithdrawalMinimum,
//   bitcoinConfirmationThreshold, withdrawalCancellationCooldownMs,
//   worstCaseNetworkFee, ... }
```

## Errors

Direct methods throw typed errors before signing whenever a precondition can be checked client-side. `instanceof` to distinguish:

| Error                        | Thrown when                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| `InvalidParamsError`         | `txid`/`recipient` not 0x-prefixed 32-byte hex, or `utxos` empty/duplicate |
| `InvalidBitcoinAddressError` | `bitcoinAddress` fails bech32(m) decode or HRP mismatches the BTC network  |
| `HashiPausedError`           | Governance has paused the operation (`deposit` or `withdraw`)              |
| `AmountBelowMinimumError`    | A UTXO or withdrawal amount is below the on-chain minimum                  |
| `HashiFetchError`            | The Hashi shared object can't be read or has an unexpected shape           |
| `HashiConfigError`           | A governance config entry is missing or malformed                          |

## Advanced: composable transactions

The direct methods (`deposit`, `requestWithdrawal`, `cancelWithdrawal`) sign and execute in one call. For sponsored transactions, dry-runs, or bundling Hashi calls into a larger PTB, use the `tx.*` builders — they return an unsigned `Transaction` and leave signing to the caller.

```ts
const tx = client.hashi.tx.deposit({ txid, utxos, recipient });
// …add more commands to `tx`, then sign and execute via your usual path.
```

Move-call thunks are also available under `client.hashi.call.*` for direct composition into hand-built PTBs.

## Bitcoin address derivation

Each Sui address maps to a unique P2TR Bitcoin deposit address. The derivation replicates `fastcrypto_tbls::threshold_schnorr::key_derivation::derive_verifying_key` — see the [Hashi address-scheme docs](https://mystenlabs.github.io/hashi/design/address-scheme.html) for the full design.
