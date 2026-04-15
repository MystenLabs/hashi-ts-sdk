/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as utxo from './utxo.js';
import * as utxo_1 from './utxo.js';
import * as utxo_2 from './utxo.js';
const $moduleName = '@local-pkg/hashi::deposit';
export const DepositConfirmationMessage = new MoveStruct({ name: `${$moduleName}::DepositConfirmationMessage`, fields: {
        request_id: bcs.Address,
        utxo: utxo.Utxo
    } });
export const DepositRequestedEvent = new MoveStruct({ name: `${$moduleName}::DepositRequestedEvent`, fields: {
        request_id: bcs.Address,
        utxo_id: utxo_1.UtxoId,
        amount: bcs.u64(),
        derivation_path: bcs.option(bcs.Address),
        timestamp_ms: bcs.u64(),
        requester_address: bcs.Address,
        sui_tx_digest: bcs.vector(bcs.u8())
    } });
export const DepositConfirmedEvent = new MoveStruct({ name: `${$moduleName}::DepositConfirmedEvent`, fields: {
        request_id: bcs.Address,
        utxo_id: utxo_2.UtxoId,
        amount: bcs.u64(),
        derivation_path: bcs.option(bcs.Address)
    } });
export const ExpiredDepositDeletedEvent = new MoveStruct({ name: `${$moduleName}::ExpiredDepositDeletedEvent`, fields: {
        request_id: bcs.Address
    } });
export interface DepositArguments {
    hashi: RawTransactionArgument<string>;
    utxo: RawTransactionArgument<string>;
}
export interface DepositOptions {
    package?: string;
    arguments: DepositArguments | [
        hashi: RawTransactionArgument<string>,
        utxo: RawTransactionArgument<string>
    ];
}
export function deposit(options: DepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/hashi';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["hashi", "utxo"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'deposit',
        function: 'deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfirmDepositArguments {
    hashi: RawTransactionArgument<string>;
    requestId: RawTransactionArgument<string>;
    cert: RawTransactionArgument<string>;
}
export interface ConfirmDepositOptions {
    package?: string;
    arguments: ConfirmDepositArguments | [
        hashi: RawTransactionArgument<string>,
        requestId: RawTransactionArgument<string>,
        cert: RawTransactionArgument<string>
    ];
}
export function confirmDeposit(options: ConfirmDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/hashi';
    const argumentsTypes = [
        null,
        'address',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["hashi", "requestId", "cert"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'deposit',
        function: 'confirm_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeleteExpiredDepositArguments {
    hashi: RawTransactionArgument<string>;
    requestId: RawTransactionArgument<string>;
}
export interface DeleteExpiredDepositOptions {
    package?: string;
    arguments: DeleteExpiredDepositArguments | [
        hashi: RawTransactionArgument<string>,
        requestId: RawTransactionArgument<string>
    ];
}
export function deleteExpiredDeposit(options: DeleteExpiredDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/hashi';
    const argumentsTypes = [
        null,
        'address',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["hashi", "requestId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'deposit',
        function: 'delete_expired_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}