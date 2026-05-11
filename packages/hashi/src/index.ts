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
    witnessProgramToAddress,
} from "./bitcoin.js";
export type {
    BitcoinNetwork,
    CancelWithdrawalParams,
    DepositFees,
    DepositHistoryItem,
    DepositInfo,
    DepositParams,
    DepositStatus,
    GovernanceConfig,
    HashiClientOptions,
    HbtcBalance,
    NetworkConfig,
    SuiNetwork,
    TransactionHistoryItem,
    UtxoId,
    UtxoLookupResult,
    UtxoOutput,
    UtxoUsageResult,
    WaitOptions,
    WithdrawalFees,
    WithdrawalHistoryItem,
    WithdrawalInfo,
    WithdrawalParams,
    WithdrawalStatus,
} from "./types.js";
