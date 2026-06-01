/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index.js";
import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
const $moduleName = "@local-pkg/hashi::update_guardian";
export const UpdateGuardian = new MoveStruct({
    name: `${$moduleName}::UpdateGuardian`,
    fields: {
        url: bcs.string(),
        public_key: bcs.vector(bcs.u8()),
    },
});
export interface ProposeArguments {
    hashi: RawTransactionArgument<string>;
    url: RawTransactionArgument<string>;
    publicKey: RawTransactionArgument<number[]>;
    metadata: RawTransactionArgument<string>;
}
export interface ProposeOptions {
    package?: string;
    arguments:
        | ProposeArguments
        | [
              hashi: RawTransactionArgument<string>,
              url: RawTransactionArgument<string>,
              publicKey: RawTransactionArgument<number[]>,
              metadata: RawTransactionArgument<string>,
          ];
}
export function propose(options: ProposeOptions) {
    const packageAddress = options.package ?? "@local-pkg/hashi";
    const argumentsTypes = [
        null,
        "0x1::string::String",
        "vector<u8>",
        null,
        "0x2::clock::Clock",
    ] satisfies (string | null)[];
    const parameterNames = ["hashi", "url", "publicKey", "metadata"];
    return (tx: Transaction) =>
        tx.moveCall({
            package: packageAddress,
            module: "update_guardian",
            function: "propose",
            arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        });
}
export interface ExecuteArguments {
    hashi: RawTransactionArgument<string>;
    proposalId: RawTransactionArgument<string>;
}
export interface ExecuteOptions {
    package?: string;
    arguments:
        | ExecuteArguments
        | [hashi: RawTransactionArgument<string>, proposalId: RawTransactionArgument<string>];
}
export function execute(options: ExecuteOptions) {
    const packageAddress = options.package ?? "@local-pkg/hashi";
    const argumentsTypes = [null, "0x2::object::ID", "0x2::clock::Clock"] satisfies (
        | string
        | null
    )[];
    const parameterNames = ["hashi", "proposalId"];
    return (tx: Transaction) =>
        tx.moveCall({
            package: packageAddress,
            module: "update_guardian",
            function: "execute",
            arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        });
}
