export { HashiClient, hashi } from "./client.js";
export {
    AmountBelowMinimumError,
    HashiConfigError,
    HashiFetchError,
    HashiPausedError,
    InvalidBitcoinAddressError,
    InvalidParamsError,
} from "./errors.js";
export type { AmountViolation, InvalidBitcoinAddressCode } from "./errors.js";
export {
    arkworksToSec1Compressed,
    bitcoinAddressToWitnessProgram,
    deriveChildPubkey,
    generateDepositAddress,
    taprootScriptPathAddress,
} from "./bitcoin.js";
export type {
    BitcoinNetwork,
    CancelWithdrawalParams,
    DepositParams,
    GovernanceConfig,
    HashiClientOptions,
    NetworkConfig,
    SuiNetwork,
    UtxoOutput,
    WithdrawalParams,
} from "./types.js";
