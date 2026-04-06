/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct } from "../utils/index.js";
import { bcs } from "@mysten/sui/bcs";
import * as object_bag from "./deps/sui/object_bag.js";
import * as object_bag_1 from "./deps/sui/object_bag.js";
import * as table from "./deps/sui/table.js";
import * as utxo from "./utxo.js";
const $moduleName = "@local-pkg/hashi::deposit_queue";
export const DepositRequestQueue = new MoveStruct({
    name: `${$moduleName}::DepositRequestQueue`,
    fields: {
        /**
         * Active deposits awaiting confirmation. ObjectBag so DepositRequest UIDs are
         * directly accessible via getObject.
         */
        requests: object_bag.ObjectBag,
        /** Completed deposits (confirmed or expired). */
        processed: object_bag_1.ObjectBag,
        /**
         * Per-sender index: sender address -> Bag of request IDs. Allows clients to
         * discover all deposit requests for a given address. TODO: consider unifying this
         * with the user_requests index in the withdrawal_queue
         */
        user_requests: table.Table,
    },
});
export const DepositRequest = new MoveStruct({
    name: `${$moduleName}::DepositRequest`,
    fields: {
        id: bcs.Address,
        sender: bcs.Address,
        timestamp_ms: bcs.u64(),
        sui_tx_digest: bcs.vector(bcs.u8()),
        utxo: utxo.Utxo,
    },
});
