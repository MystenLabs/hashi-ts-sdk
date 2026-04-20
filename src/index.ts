export { HashiClient, hashi } from "./client.js";
export { HashiConfigError, HashiFetchError } from "./errors.js";
export {
    generateDepositAddress,
    deriveChildPubkey,
    taprootScriptPathAddress,
    arkworksToSec1Compressed,
} from "./bitcoin.js";
export type {
    BitcoinNetwork,
    GovernanceConfig,
    HashiClientOptions,
    NetworkConfig,
    SuiNetwork,
} from "./types.js";
