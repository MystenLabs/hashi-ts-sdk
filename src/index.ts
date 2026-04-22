export { HashiClient, hashi } from "./client.js";
export {
    AmountBelowMinimumError,
    HashiConfigError,
    HashiFetchError,
    HashiPausedError,
    InvalidDepositParamsError,
} from "./errors.js";
export type { AmountViolation } from "./errors.js";
export {
    generateDepositAddress,
    deriveChildPubkey,
    taprootScriptPathAddress,
    arkworksToSec1Compressed,
} from "./bitcoin.js";
export type {
    BitcoinNetwork,
    DepositParams,
    GovernanceConfig,
    HashiClientOptions,
    NetworkConfig,
    SuiNetwork,
    UtxoOutput,
} from "./types.js";
