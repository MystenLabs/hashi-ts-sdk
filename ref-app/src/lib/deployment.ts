import { NETWORK_CONFIG } from "@mysten-incubation/hashi";
import type { BitcoinNetwork, SuiNetwork } from "@mysten-incubation/hashi";

const env = import.meta.env;

/**
 * Deployment / network configuration for the ref app.
 *
 * Defaults to the SDK's built-in `NETWORK_CONFIG` for the chosen Sui network,
 * but every value can be overridden via a `ref-app/.env`. This matters because
 * Sui devnet is reset periodically — when it is, the built-in object/package IDs
 * go stale and reads fail with `HashiFetchError`. Point the app at a fresh
 * deployment (or a local hashi-localnet) by setting the `VITE_*` vars below.
 */
export const SUI_NETWORK = (env.VITE_SUI_NETWORK as SuiNetwork | undefined) ?? "devnet";

const fallback = NETWORK_CONFIG[SUI_NETWORK];

export const HASHI_OBJECT_ID = env.VITE_HASHI_OBJECT_ID ?? fallback?.hashiObjectId;
export const HASHI_PACKAGE_ID = env.VITE_HASHI_PACKAGE_ID ?? fallback?.packageId;

export const BITCOIN_NETWORK: BitcoinNetwork =
  (env.VITE_BITCOIN_NETWORK as BitcoinNetwork | undefined) ?? fallback?.bitcoinNetwork ?? "signet";

/** Sui full-node base URL (override for localnet, e.g. http://127.0.0.1:9000). */
export const SUI_RPC_URL = env.VITE_SUI_RPC_URL ?? `https://fullnode.${SUI_NETWORK}.sui.io:443`;

/** Optional Bitcoin Core JSON-RPC URL for `client.hashi.bitcoin.*` lookups. */
export const BTC_RPC_URL = env.VITE_BTC_RPC_URL || undefined;

/** hBTC coin type, derived from the resolved package id (undefined if unconfigured). */
export const BTC_TYPE = HASHI_PACKAGE_ID ? `${HASHI_PACKAGE_ID}::btc::BTC` : undefined;
