/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import {
    MoveStruct,
    MoveEnum,
    normalizeMoveArguments,
    type RawTransactionArgument,
} from "../utils/index.js";
import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
import * as object_bag from "./deps/sui/object_bag.js";
import * as object_bag_1 from "./deps/sui/object_bag.js";
import * as object_bag_2 from "./deps/sui/object_bag.js";
import * as object_bag_3 from "./deps/sui/object_bag.js";
import * as balance from "./deps/sui/balance.js";
import * as utxo from "./utxo.js";
import * as utxo_1 from "./utxo.js";
import * as utxo_2 from "./utxo.js";
const $moduleName = "@local-pkg/hashi::withdrawal_queue";
export const WithdrawalRequestQueue = new MoveStruct({
    name: `${$moduleName}::WithdrawalRequestQueue`,
    fields: {
        /**
         * Active requests awaiting action (Requested, Approved). ObjectBag so
         * WithdrawalRequest UIDs are directly accessible via getObject.
         */
        requests: object_bag.ObjectBag,
        /**
         * Processed requests — BTC consumed, lifecycle continuing or complete (Processing,
         * Signed, Confirmed).
         */
        processed: object_bag_1.ObjectBag,
        /**
         * In-flight withdrawal transactions (unsigned, signed but unconfirmed). ObjectBag
         * so WithdrawalTransaction UIDs are directly accessible via getObject.
         */
        withdrawal_txns: object_bag_2.ObjectBag,
        /** Confirmed withdrawal transactions (historical record). */
        confirmed_txns: object_bag_3.ObjectBag,
    },
});
export const OutputUtxo = new MoveStruct({
    name: `${$moduleName}::OutputUtxo`,
    fields: {
        amount: bcs.u64(),
        bitcoin_address: bcs.vector(bcs.u8()),
    },
});
export const WithdrawalStatus = new MoveEnum({
    name: `${$moduleName}::WithdrawalStatus`,
    fields: {
        Requested: null,
        Approved: null,
        Processing: null,
        Signed: null,
        Confirmed: null,
    },
});
export const WithdrawalRequest = new MoveStruct({
    name: `${$moduleName}::WithdrawalRequest`,
    fields: {
        id: bcs.Address,
        sender: bcs.Address,
        btc_amount: bcs.u64(),
        bitcoin_address: bcs.vector(bcs.u8()),
        timestamp_ms: bcs.u64(),
        status: WithdrawalStatus,
        withdrawal_txn_id: bcs.option(bcs.Address),
        sui_tx_digest: bcs.vector(bcs.u8()),
        btc: balance.Balance,
    },
});
export const WithdrawalTransaction = new MoveStruct({
    name: `${$moduleName}::WithdrawalTransaction`,
    fields: {
        id: bcs.Address,
        txid: bcs.Address,
        request_ids: bcs.vector(bcs.Address),
        /**
         * UTXOs consumed by this withdrawal. The UTXOs remain locked in the pool until
         * `confirm_withdrawal()` moves them to spent; these copies are kept for event
         * emission and fee accounting.
         */
        inputs: bcs.vector(utxo.Utxo),
        withdrawal_outputs: bcs.vector(OutputUtxo),
        change_output: bcs.option(OutputUtxo),
        timestamp_ms: bcs.u64(),
        randomness: bcs.vector(bcs.u8()),
        /**
         * Per-input Schnorr signatures from the MPC committee. Populated by
         * `sign_withdrawal` once both the MPC and the guardian have signed.
         */
        signatures: bcs.option(bcs.vector(bcs.vector(bcs.u8()))),
        /**
         * Per-input Schnorr signatures from the guardian enclave. Same length as
         * `signatures`; together they form the 2-of-2 taproot witness. Populated by
         * `sign_withdrawal` alongside `signatures`.
         */
        guardian_signatures: bcs.option(bcs.vector(bcs.vector(bcs.u8()))),
        /**
         * Global presignature start index assigned at construction time. Input `i` uses
         * presig at index `presig_start_index + i`.
         */
        presig_start_index: bcs.u64(),
        epoch: bcs.u64(),
    },
});
export const CommittedRequestInfo = new MoveStruct({
    name: `${$moduleName}::CommittedRequestInfo`,
    fields: {
        btc_amount: bcs.u64(),
        bitcoin_address: bcs.vector(bcs.u8()),
    },
});
export const WithdrawalRequestedEvent = new MoveStruct({
    name: `${$moduleName}::WithdrawalRequestedEvent`,
    fields: {
        request_id: bcs.Address,
        btc_amount: bcs.u64(),
        bitcoin_address: bcs.vector(bcs.u8()),
        timestamp_ms: bcs.u64(),
        requester_address: bcs.Address,
        sui_tx_digest: bcs.vector(bcs.u8()),
    },
});
export const WithdrawalApprovedEvent = new MoveStruct({
    name: `${$moduleName}::WithdrawalApprovedEvent`,
    fields: {
        request_id: bcs.Address,
    },
});
export const WithdrawalPickedForProcessingEvent = new MoveStruct({
    name: `${$moduleName}::WithdrawalPickedForProcessingEvent`,
    fields: {
        withdrawal_txn_id: bcs.Address,
        txid: bcs.Address,
        request_ids: bcs.vector(bcs.Address),
        inputs: bcs.vector(utxo_1.Utxo),
        withdrawal_outputs: bcs.vector(OutputUtxo),
        change_output: bcs.option(OutputUtxo),
        timestamp_ms: bcs.u64(),
        randomness: bcs.vector(bcs.u8()),
    },
});
export const WithdrawalSignedEvent = new MoveStruct({
    name: `${$moduleName}::WithdrawalSignedEvent`,
    fields: {
        withdrawal_txn_id: bcs.Address,
        request_ids: bcs.vector(bcs.Address),
        /** Per-input Schnorr signatures from the MPC committee. */
        signatures: bcs.vector(bcs.vector(bcs.u8())),
        /**
         * Per-input Schnorr signatures from the guardian enclave. Same length as
         * `signatures`; the watcher pairs index `i` of both to form the witness for input
         * `i` at broadcast time.
         */
        guardian_signatures: bcs.vector(bcs.vector(bcs.u8())),
    },
});
export const WithdrawalPresigsReassignedEvent = new MoveStruct({
    name: `${$moduleName}::WithdrawalPresigsReassignedEvent`,
    fields: {
        withdrawal_txn_id: bcs.Address,
        epoch: bcs.u64(),
        presig_start_index: bcs.u64(),
    },
});
export const WithdrawalConfirmedEvent = new MoveStruct({
    name: `${$moduleName}::WithdrawalConfirmedEvent`,
    fields: {
        withdrawal_txn_id: bcs.Address,
        txid: bcs.Address,
        change_utxo_id: bcs.option(utxo_2.UtxoId),
        request_ids: bcs.vector(bcs.Address),
        change_utxo_amount: bcs.option(bcs.u64()),
    },
});
export const WithdrawalCancelledEvent = new MoveStruct({
    name: `${$moduleName}::WithdrawalCancelledEvent`,
    fields: {
        request_id: bcs.Address,
        requester_address: bcs.Address,
        btc_amount: bcs.u64(),
    },
});
export interface OutputUtxoArguments {
    amount: RawTransactionArgument<number | bigint>;
    bitcoinAddress: RawTransactionArgument<number[]>;
}
export interface OutputUtxoOptions {
    package?: string;
    arguments:
        | OutputUtxoArguments
        | [
              amount: RawTransactionArgument<number | bigint>,
              bitcoinAddress: RawTransactionArgument<number[]>,
          ];
}
export function outputUtxo(options: OutputUtxoOptions) {
    const packageAddress = options.package ?? "@local-pkg/hashi";
    const argumentsTypes = ["u64", "vector<u8>"] satisfies (string | null)[];
    const parameterNames = ["amount", "bitcoinAddress"];
    return (tx: Transaction) =>
        tx.moveCall({
            package: packageAddress,
            module: "withdrawal_queue",
            function: "output_utxo",
            arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        });
}
export interface IsApprovedArguments {
    self: RawTransactionArgument<string>;
}
export interface IsApprovedOptions {
    package?: string;
    arguments: IsApprovedArguments | [self: RawTransactionArgument<string>];
}
export function isApproved(options: IsApprovedOptions) {
    const packageAddress = options.package ?? "@local-pkg/hashi";
    const argumentsTypes = [null] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) =>
        tx.moveCall({
            package: packageAddress,
            module: "withdrawal_queue",
            function: "is_approved",
            arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        });
}
