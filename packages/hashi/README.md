# @mysten-incubation/hashi

TypeScript SDK for the [Hashi](https://github.com/MystenLabs/hashi) protocol. Hashi is a decentralized Bitcoin collateralization primitive on Sui. Orchestrate native BTC directly from smart contracts—without centralized balance sheets.

> [!CAUTION]
> **Pre-1.0:** This package is under active development. Minor versions may contain breaking changes until the API stabilizes at 1.0.

> [!WARNING]
> Sui **testnet** and **devnet** are wired up (Bitcoin **signet** by default). Prefer testnet — devnet support is temporary. Mainnet is not yet deployed.

## Install

```bash
pnpm add @mysten-incubation/hashi @mysten/sui
```

`@mysten/sui` is a peer dependency.

## Quick start

The SDK attaches to any Sui client via `$extend`:

```ts
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { hashi } from "@mysten-incubation/hashi";

const client = new SuiGrpcClient({
  network: "testnet",
  baseUrl: "https://fullnode.testnet.sui.io:443",
}).$extend(hashi({ network: "testnet" }));

const signer = Ed25519Keypair.fromSecretKey(/* … */);
const recipient = signer.toSuiAddress();

// Derive your unique P2TR Bitcoin deposit address.
const btcAddress = await client.hashi.generateDepositAddress({ suiAddress: recipient });

// After sending BTC to `btcAddress`, record the funding tx on Sui:
await client.hashi.deposit({
  signer,
  txid: "0x<64-hex display-order txid>",
  utxos: [{ vout: 0, amountSats: 100_000n }],
  recipient,
});
```

End-user actions only: **deposit**, **request withdrawal**, **cancel withdrawal**. An optional `client.hashi.guardian.*` namespace reads the guardian's rate-limiter headroom (`limiterStatus`, `canWithdraw`) — see the root README.

## Documentation

Full guide — including withdrawals, cancellations, governance views, composable transactions, and the typed error model — lives in the repository root README:

→ **https://github.com/MystenLabs/hashi-ts-sdk#readme**

## License

Apache-2.0
