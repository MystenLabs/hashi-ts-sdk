/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/** Module: hashi */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index.js";
import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
import * as committee_set from "./committee_set.js";
import * as config from "./config.js";
import * as treasury from "./treasury.js";
import * as bag from "./deps/sui/bag.js";
import * as bag_1 from "./deps/sui/bag.js";
const $moduleName = "@local-pkg/hashi::hashi";
export const Hashi = new MoveStruct({
    name: `${$moduleName}::Hashi`,
    fields: {
        id: bcs.Address,
        committee_set: committee_set.CommitteeSet,
        config: config.Config,
        treasury: treasury.Treasury,
        proposals: bag.Bag,
        /** TOB certificates by (epoch, batch_index) -> EpochCertsV1 */
        tob: bag_1.Bag,
        /**
         * Number of presignatures consumed in the current epoch. Used by recovering nodes
         * to derive `(batch_index, index_in_batch)`.
         */
        num_consumed_presigs: bcs.u64(),
    },
});
export interface FinishPublishArguments {
    self: RawTransactionArgument<string>;
    upgradeCap: RawTransactionArgument<string>;
    bitcoinChainId: RawTransactionArgument<string>;
    coinRegistry: RawTransactionArgument<string>;
}
export interface FinishPublishOptions {
    package?: string;
    arguments:
        | FinishPublishArguments
        | [
              self: RawTransactionArgument<string>,
              upgradeCap: RawTransactionArgument<string>,
              bitcoinChainId: RawTransactionArgument<string>,
              coinRegistry: RawTransactionArgument<string>,
          ];
}
export function finishPublish(options: FinishPublishOptions) {
    const packageAddress = options.package ?? "@local-pkg/hashi";
    const argumentsTypes = [null, null, "address", null] satisfies (string | null)[];
    const parameterNames = ["self", "upgradeCap", "bitcoinChainId", "coinRegistry"];
    return (tx: Transaction) =>
        tx.moveCall({
            package: packageAddress,
            module: "hashi",
            function: "finish_publish",
            arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        });
}
