/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct } from "../utils/index.js";
import { bcs } from "@mysten/sui/bcs";
import * as deposit_queue from "./deposit_queue.js";
import * as withdrawal_queue from "./withdrawal_queue.js";
import * as utxo_pool from "./utxo_pool.js";
import * as table from "./deps/sui/table.js";
const $moduleName = "@local-pkg/hashi::bitcoin_state";
export const BitcoinStateKey = new MoveStruct({
    name: `${$moduleName}::BitcoinStateKey`,
    fields: {
        dummy_field: bcs.bool(),
    },
});
export const BitcoinState = new MoveStruct({
    name: `${$moduleName}::BitcoinState`,
    fields: {
        deposit_queue: deposit_queue.DepositRequestQueue,
        withdrawal_queue: withdrawal_queue.WithdrawalRequestQueue,
        utxo_pool: utxo_pool.UtxoPool,
        /**
         * Per-user index: user address -> Bag of request IDs (deposits and withdrawals).
         * Allows clients to discover all requests for a given address.
         */
        user_requests: table.Table,
    },
});
