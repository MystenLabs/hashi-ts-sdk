// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: "unit",
                    include: ["test/unit/**/*.test.ts"],
                },
            },
            {
                test: {
                    name: "integration",
                    include: ["test/integration/**/*.test.ts"],
                    testTimeout: 30_000,
                },
            },
        ],
    },
});
