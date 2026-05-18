# @mysten-incubation/hashi

TypeScript SDK for the [Hashi](https://github.com/MystenLabs/hashi) protocol. Hashi is a decentralized Bitcoin collateralization primitive on Sui. Orchestrate native BTC directly from smart contracts—without centralized balance sheets.

> [!CAUTION]
> **Pre-1.0:** This package is under active development. Minor versions may contain breaking changes until the API stabilizes at 1.0.

> [!WARNING]
> Only Sui **devnet** is currently wired up (Bitcoin **signet** by default). Testnet and mainnet are not yet deployed.

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
  network: "devnet",
  baseUrl: "https://fullnode.devnet.sui.io:443",
}).$extend(hashi({ network: "devnet" }));

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

End-user actions only: **deposit**, **request withdrawal**, **cancel withdrawal**.

## Documentation

Full guide — including withdrawals, cancellations, governance views, composable transactions, and the typed error model — lives in the repository root README:

→ **https://github.com/MystenLabs/hashi-ts-sdk#readme**

## License

Apache-2.0
