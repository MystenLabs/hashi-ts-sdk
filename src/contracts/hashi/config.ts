/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * Core configuration: versioning, pause state, upgrade management, and generic
 * key-value config store. Chain-specific configuration (e.g. BTC fee parameters)
 * lives in separate modules that use get/upsert.
 */

import { MoveStruct } from "../utils/index.js";
import { bcs } from "@mysten/sui/bcs";
import * as vec_map from "./deps/sui/vec_map.js";
import * as config_value from "./config_value.js";
import * as vec_set from "./deps/sui/vec_set.js";
import * as _package from "./deps/sui/package.js";
const $moduleName = "@local-pkg/hashi::config";
export const Config = new MoveStruct({
    name: `${$moduleName}::Config`,
    fields: {
        config: vec_map.VecMap(bcs.string(), config_value.Value),
        enabled_versions: vec_set.VecSet(bcs.u64()),
        upgrade_cap: bcs.option(_package.UpgradeCap),
    },
});
