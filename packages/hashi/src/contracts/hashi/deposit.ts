/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index.js";
import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
import * as utxo from "./utxo.js";
import * as utxo_1 from "./utxo.js";
import * as utxo_2 from "./utxo.js";
import * as committee from "./committee.js";
import * as utxo_3 from "./utxo.js";
const $moduleName = "@local-pkg/hashi::deposit";
export const DepositConfirmationMessage = new MoveStruct({
    name: `${$moduleName}::DepositConfirmationMessage`,
    fields: {
        request_id: bcs.Address,
        utxo: utxo.Utxo,
    },
});
export const DepositRequestedEvent = new MoveStruct({
    name: `${$moduleName}::DepositRequestedEvent`,
    fields: {
        request_id: bcs.Address,
        utxo_id: utxo_1.UtxoId,
        amount: bcs.u64(),
        derivation_path: bcs.option(bcs.Address),
        timestamp_ms: bcs.u64(),
        requester_address: bcs.Address,
        sui_tx_digest: bcs.vector(bcs.u8()),
    },
});
export const DepositApprovedEvent = new MoveStruct({
    name: `${$moduleName}::DepositApprovedEvent`,
    fields: {
        request_id: bcs.Address,
        utxo: utxo_2.Utxo,
        cert: committee.CommitteeSignature,
        approval_timestamp_ms: bcs.u64(),
    },
});
export const DepositConfirmedEvent = new MoveStruct({
    name: `${$moduleName}::DepositConfirmedEvent`,
    fields: {
        request_id: bcs.Address,
        utxo: utxo_3.Utxo,
    },
});
export const ExpiredDepositDeletedEvent = new MoveStruct({
    name: `${$moduleName}::ExpiredDepositDeletedEvent`,
    fields: {
        request_id: bcs.Address,
    },
});
export interface DepositArguments {
    hashi: RawTransactionArgument<string>;
    utxo: RawTransactionArgument<string>;
}
export interface DepositOptions {
    package?: string;
    arguments:
        | DepositArguments
        | [hashi: RawTransactionArgument<string>, utxo: RawTransactionArgument<string>];
}
export function deposit(options: DepositOptions) {
    const packageAddress = options.package ?? "@local-pkg/hashi";
    const argumentsTypes = [null, null, "0x2::clock::Clock"] satisfies (string | null)[];
    const parameterNames = ["hashi", "utxo"];
    return (tx: Transaction) =>
        tx.moveCall({
            package: packageAddress,
            module: "deposit",
            function: "deposit",
            arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        });
}
export interface ApproveDepositArguments {
    hashi: RawTransactionArgument<string>;
    requestId: RawTransactionArgument<string>;
    cert: RawTransactionArgument<string>;
}
export interface ApproveDepositOptions {
    package?: string;
    arguments:
        | ApproveDepositArguments
        | [
              hashi: RawTransactionArgument<string>,
              requestId: RawTransactionArgument<string>,
              cert: RawTransactionArgument<string>,
          ];
}
/**
 * First phase of deposit confirmation. Records a committee certificate over
 * `(request_id, utxo)` on the request, alongside the approval timestamp, and
 * re-inserts the request into the queue.
 *
 * The approval is not yet final — `confirm_deposit` must be called after the
 * configured `bitcoin_deposit_time_delay_ms` has elapsed. The delay gives
 * operators a window to detect a faulty or fraudulent committee signature and
 * pause the service before funds are minted; while paused, `confirm_deposit` is
 * rejected, leaving the approval parked. If the committee rotates during the
 * window, the deposit will also need to be re-approved by the new epoch's
 * committee.
 */
export function approveDeposit(options: ApproveDepositOptions) {
    const packageAddress = options.package ?? "@local-pkg/hashi";
    const argumentsTypes = [null, "address", null, "0x2::clock::Clock"] satisfies (string | null)[];
    const parameterNames = ["hashi", "requestId", "cert"];
    return (tx: Transaction) =>
        tx.moveCall({
            package: packageAddress,
            module: "deposit",
            function: "approve_deposit",
            arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        });
}
export interface ConfirmDepositArguments {
    hashi: RawTransactionArgument<string>;
    requestId: RawTransactionArgument<string>;
}
export interface ConfirmDepositOptions {
    package?: string;
    arguments:
        | ConfirmDepositArguments
        | [hashi: RawTransactionArgument<string>, requestId: RawTransactionArgument<string>];
}
/**
 * Second phase of deposit confirmation. Re-verifies the stored committee
 * certificate against the current committee, enforces the time-delay since
 * approval, then mints BTC to the recipient (if any) and moves the UTXO into the
 * active pool.
 *
 * Re-verifying against the current committee means an approval from a rotated-out
 * committee will not confirm — it must be re-approved by the current committee.
 * Aborts if the request was never approved (no stored cert), the cert no longer
 * verifies (committee rotated), or the time-delay window has not yet elapsed.
 */
export function confirmDeposit(options: ConfirmDepositOptions) {
    const packageAddress = options.package ?? "@local-pkg/hashi";
    const argumentsTypes = [null, "address", "0x2::clock::Clock"] satisfies (string | null)[];
    const parameterNames = ["hashi", "requestId"];
    return (tx: Transaction) =>
        tx.moveCall({
            package: packageAddress,
            module: "deposit",
            function: "confirm_deposit",
            arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        });
}
export interface DeleteExpiredDepositArguments {
    hashi: RawTransactionArgument<string>;
    requestId: RawTransactionArgument<string>;
}
export interface DeleteExpiredDepositOptions {
    package?: string;
    arguments:
        | DeleteExpiredDepositArguments
        | [hashi: RawTransactionArgument<string>, requestId: RawTransactionArgument<string>];
}
export function deleteExpiredDeposit(options: DeleteExpiredDepositOptions) {
    const packageAddress = options.package ?? "@local-pkg/hashi";
    const argumentsTypes = [null, "address", "0x2::clock::Clock"] satisfies (string | null)[];
    const parameterNames = ["hashi", "requestId"];
    return (tx: Transaction) =>
        tx.moveCall({
            package: packageAddress,
            module: "deposit",
            function: "delete_expired_deposit",
            arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        });
}
