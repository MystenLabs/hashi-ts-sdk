/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct } from "../utils/index.js";
import { bcs } from "@mysten/sui/bcs";
import * as bag from "./deps/sui/bag.js";
import * as bag_1 from "./deps/sui/bag.js";
import * as utxo from "./utxo.js";
import * as utxo_1 from "./utxo.js";
const $moduleName = "@local-pkg/hashi::utxo_pool";
export const UtxoPool = new MoveStruct({
    name: `${$moduleName}::UtxoPool`,
    fields: {
        utxo_records: bag.Bag,
        spent_utxos: bag_1.Bag,
    },
});
export const UtxoRecord = new MoveStruct({
    name: `${$moduleName}::UtxoRecord`,
    fields: {
        utxo: utxo.Utxo,
        produced_by: bcs.option(bcs.Address),
        locked_by: bcs.option(bcs.Address),
    },
});
export const UtxoSpentEvent = new MoveStruct({
    name: `${$moduleName}::UtxoSpentEvent`,
    fields: {
        utxo_id: utxo_1.UtxoId,
        spent_epoch: bcs.u64(),
    },
});
