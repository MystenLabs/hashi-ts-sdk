import { NETWORK_CONFIG } from "@mysten-incubation/hashi";

const config = NETWORK_CONFIG.devnet;
if (!config) throw new Error("Hashi devnet NETWORK_CONFIG missing — SDK constants drift?");

export const BTC_TYPE = `${config.packageId}::btc::BTC`;
export const HASHI_PACKAGE_ID = config.packageId;
export const HASHI_OBJECT_ID = config.hashiObjectId;
/** The Bitcoin network the SDK resolves for devnet — source of truth for address decoding. */
export const BITCOIN_NETWORK = config.bitcoinNetwork;
