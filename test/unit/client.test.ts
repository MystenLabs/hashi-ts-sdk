import { describe, it, expect, vi, beforeEach } from "vitest";
import { HashiClient, hashi } from "../../src/client.js";
import { Hashi } from "../../src/contracts/hashi/hashi.js";
import { generateDepositAddress } from "../../src/bitcoin.js";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { fromHex } from "@mysten/sui/utils";

const HASHI_OBJECT_ID = "0x0000000000000000000000000000000000000000000000000000000000000001";
const PACKAGE_ID = "0x0000000000000000000000000000000000000000000000000000000000000002";
const REQUEST_ID = "0x0000000000000000000000000000000000000000000000000000000000000003";

/** Deterministic test key: secret = 2 (matches TEST_HASHI_BTC_SK in Rust tests). */
const TEST_SECRET = new Uint8Array(32);
TEST_SECRET[31] = 2;
const TEST_MPC_KEY = secp256k1.getPublicKey(TEST_SECRET, true); // 33 bytes

const TEST_SUI_ADDRESS = "0xabcdef0000000000000000000000000000000000000000000000000000000001";

describe("HashiClient", () => {
    let client: SuiGrpcClient & { hashi: HashiClient };

    beforeEach(() => {
        client = new SuiGrpcClient({
            network: "devnet",
            baseUrl: "https://fullnode.devnet.sui.io:443",
        }).$extend(
            hashi({
                network: "devnet",
                hashiObjectId: HASHI_OBJECT_ID,
                packageId: PACKAGE_ID,
                bitcoinNetwork: "regtest",
            }),
        );
    });

    describe("generateDepositAddress", () => {
        it("generates a deposit address by fetching MPC key from on-chain", async () => {
            // Mock Hashi.get to return a fake object with our test MPC key
            vi.spyOn(Hashi, "get").mockResolvedValueOnce({
                json: {
                    id: HASHI_OBJECT_ID,
                    committee_set: {
                        members: HASHI_OBJECT_ID,
                        epoch: 0n,
                        committees: HASHI_OBJECT_ID,
                        pending_epoch_change: null,
                        mpc_public_key: Array.from(TEST_MPC_KEY),
                    },
                    config: {
                        config: { contents: [] },
                        enabled_versions: { contents: [] },
                        upgrade_cap: null,
                    },
                    treasury: { objects: HASHI_OBJECT_ID },
                    proposals: HASHI_OBJECT_ID,
                    tob: HASHI_OBJECT_ID,
                    num_consumed_presigs: 0n,
                },
            } as never);

            const btcAddress = await client.hashi.generateDepositAddress({
                suiAddress: TEST_SUI_ADDRESS,
            });

            // Verify it matches the pure-function output
            const expected = generateDepositAddress(
                TEST_MPC_KEY,
                fromHex(TEST_SUI_ADDRESS),
                "regtest",
            );
            expect(btcAddress).toBe(expected);
            expect(btcAddress).toMatch(/^bcrt1p/);
        });

        it("throws when MPC key is not yet available", async () => {
            vi.spyOn(Hashi, "get").mockResolvedValueOnce({
                json: {
                    id: HASHI_OBJECT_ID,
                    committee_set: {
                        members: HASHI_OBJECT_ID,
                        epoch: 0n,
                        committees: HASHI_OBJECT_ID,
                        pending_epoch_change: null,
                        mpc_public_key: [], // empty — DKG not done
                    },
                    config: {
                        config: { contents: [] },
                        enabled_versions: { contents: [] },
                        upgrade_cap: null,
                    },
                    treasury: { objects: HASHI_OBJECT_ID },
                    proposals: HASHI_OBJECT_ID,
                    tob: HASHI_OBJECT_ID,
                    num_consumed_presigs: 0n,
                },
            } as never);

            await expect(
                client.hashi.generateDepositAddress({
                    suiAddress: TEST_SUI_ADDRESS,
                }),
            ).rejects.toThrow("MPC public key not available");
        });

        it.todo("derives a BTC deposit address from a live devnet MPC key", async () => {
            const devnetClient = new SuiGrpcClient({
                network: "devnet",
                baseUrl: "https://fullnode.devnet.sui.io:443",
            }).$extend(hashi({ network: "devnet" }));

            const suiAddress = "0xe40c8cf8b53822829b3a6dc9aea84b62653f60b771e9da4bd4e214cae851b87b";

            const btcAddress = await devnetClient.hashi.generateDepositAddress({
                suiAddress,
            });

            console.log("BTC deposit address:", btcAddress);
            console.log("Sui address:", suiAddress);

            // signet/testnet addresses start with tb1p
            expect(btcAddress).toMatch(/^tb1p/);
            expect(btcAddress.length).toBeGreaterThan(40);
            // Should match the address shown in the frontend: https://devnet.hashi.sui.io/deposit
            expect(btcAddress).toEqual(
                "tb1paf8w48vlsy0k9pyrt6rrjcj2nxnm00cemf0enn84qu3936qxaa7qzd8ex2",
            );
        });

        it("allows overriding the network per call", async () => {
            vi.spyOn(Hashi, "get").mockResolvedValue({
                json: {
                    id: HASHI_OBJECT_ID,
                    committee_set: {
                        members: HASHI_OBJECT_ID,
                        epoch: 0n,
                        committees: HASHI_OBJECT_ID,
                        pending_epoch_change: null,
                        mpc_public_key: Array.from(TEST_MPC_KEY),
                    },
                    config: {
                        config: { contents: [] },
                        enabled_versions: { contents: [] },
                        upgrade_cap: null,
                    },
                    treasury: { objects: HASHI_OBJECT_ID },
                    proposals: HASHI_OBJECT_ID,
                    tob: HASHI_OBJECT_ID,
                    num_consumed_presigs: 0n,
                },
            } as never);

            // Client default is regtest, but we override to testnet
            const addr = await client.hashi.generateDepositAddress({
                suiAddress: TEST_SUI_ADDRESS,
                bitcoinNetwork: "testnet",
            });
            expect(addr).toMatch(/^tb1p/);
        });
    });

    describe("deposit", () => {
        it.todo("creates a deposit");
    });

    describe("withdraw", () => {
        it.todo("creates a withdrawal");
    });

    describe("requestSignetFaucet", () => {
        it.todo("requests BTC from the signet faucet");
    });

    describe("unsupported networks", () => {
        it("throws for testnet without a custom hashiObjectId", () => {
            expect(() =>
                new SuiGrpcClient({
                    network: "testnet",
                    baseUrl: "https://fullnode.testnet.sui.io:443",
                }).$extend(hashi({ network: "testnet" })),
            ).toThrow("not yet supported on Sui testnet");
        });

        it("throws for mainnet without a custom hashiObjectId", () => {
            expect(() =>
                new SuiGrpcClient({
                    network: "mainnet",
                    baseUrl: "https://fullnode.mainnet.sui.io:443",
                }).$extend(hashi({ network: "mainnet" })),
            ).toThrow("not yet supported on Sui mainnet");
        });

        it("allows unsupported networks with a custom hashiObjectId and packageId", () => {
            expect(() =>
                new SuiGrpcClient({
                    network: "testnet",
                    baseUrl: "https://fullnode.testnet.sui.io:443",
                }).$extend(
                    hashi({
                        network: "testnet",
                        hashiObjectId: HASHI_OBJECT_ID,
                        packageId: PACKAGE_ID,
                    }),
                ),
            ).not.toThrow();
        });
    });

    describe("view", () => {
        describe("mpcPublicKey", () => {
            it("returns the 33-byte compressed MPC key", async () => {
                vi.spyOn(Hashi, "get").mockResolvedValueOnce({
                    json: {
                        id: HASHI_OBJECT_ID,
                        committee_set: {
                            members: HASHI_OBJECT_ID,
                            epoch: 0n,
                            committees: HASHI_OBJECT_ID,
                            pending_epoch_change: null,
                            mpc_public_key: Array.from(TEST_MPC_KEY),
                        },
                        config: {
                            config: { contents: [] },
                            enabled_versions: { contents: [] },
                            upgrade_cap: null,
                        },
                        treasury: { objects: HASHI_OBJECT_ID },
                        proposals: HASHI_OBJECT_ID,
                        tob: HASHI_OBJECT_ID,
                        num_consumed_presigs: 0n,
                    },
                } as never);

                const key = await client.hashi.view.mpcPublicKey();
                expect(key).toBeInstanceOf(Uint8Array);
                expect(key.length).toBe(33);
                expect(key[0]).toBeOneOf([0x02, 0x03]); // valid compressed prefix
                expect(key).toEqual(TEST_MPC_KEY);
            });

            it("throws when DKG has not completed", async () => {
                vi.spyOn(Hashi, "get").mockResolvedValueOnce({
                    json: {
                        id: HASHI_OBJECT_ID,
                        committee_set: {
                            members: HASHI_OBJECT_ID,
                            epoch: 0n,
                            committees: HASHI_OBJECT_ID,
                            pending_epoch_change: null,
                            mpc_public_key: [],
                        },
                        config: {
                            config: { contents: [] },
                            enabled_versions: { contents: [] },
                            upgrade_cap: null,
                        },
                        treasury: { objects: HASHI_OBJECT_ID },
                        proposals: HASHI_OBJECT_ID,
                        tob: HASHI_OBJECT_ID,
                        num_consumed_presigs: 0n,
                    },
                } as never);

                await expect(client.hashi.view.mpcPublicKey()).rejects.toThrow(
                    "MPC public key not available",
                );
            });
        });

        it.todo("bitcoinDepositMinimum");
        it.todo("bitcoinWithdrawalMinimum");
        it.todo("bitcoinConfirmationThreshold");
        it.todo("paused");
        it.todo("withdrawalCancellationCooldownMs");
        it.todo("bitcoinChainId");
        it.todo("depositMinimum");
        it.todo("worstCaseNetworkFee");
    });

    describe("tx", () => {
        describe("deposit", () => {
            it("composes utxo_id + utxo + deposit", () => {
                const tx = client.hashi.tx.deposit({
                    txid: "0x" + "ab".repeat(32),
                    vout: 0,
                    amount: 100_000n,
                    suiAddress: TEST_SUI_ADDRESS,
                });
                expect(tx).toBeInstanceOf(Transaction);

                const { commands } = tx.getData();
                expect(commands).toHaveLength(3);

                expect(commands[0].$kind).toBe("MoveCall");
                expect(commands[0].MoveCall?.function).toBe("utxo_id");

                expect(commands[1].$kind).toBe("MoveCall");
                expect(commands[1].MoveCall?.function).toBe("utxo");

                expect(commands[2].$kind).toBe("MoveCall");
                expect(commands[2].MoveCall?.function).toBe("deposit");
            });
        });

        describe("cancelWithdrawal", () => {
            it("composes cancel + from_balance + transferObjects", () => {
                const tx = client.hashi.tx.cancelWithdrawal({
                    requestId: REQUEST_ID,
                    recipient: TEST_SUI_ADDRESS,
                });
                expect(tx).toBeInstanceOf(Transaction);

                const { commands } = tx.getData();
                expect(commands).toHaveLength(3);

                expect(commands[0].$kind).toBe("MoveCall");
                expect(commands[0].MoveCall?.function).toBe("cancel_withdrawal");

                expect(commands[1].$kind).toBe("MoveCall");
                expect(commands[1].MoveCall?.function).toBe("from_balance");
                expect(commands[1].MoveCall?.typeArguments).toEqual([`${PACKAGE_ID}::btc::BTC`]);

                expect(commands[2].$kind).toBe("TransferObjects");
            });
        });

        describe("requestWithdrawal", () => {
            it("composes coinWithBalance + into_balance + request_withdrawal", () => {
                const tx = client.hashi.tx.requestWithdrawal({
                    amount: 50_000n,
                    bitcoinAddress: new Uint8Array(32),
                });
                expect(tx).toBeInstanceOf(Transaction);

                const { commands } = tx.getData();
                const moveCalls = commands.filter((c) => c.$kind === "MoveCall");

                const intoBalance = moveCalls.find((c) => c.MoveCall?.function === "into_balance");
                expect(intoBalance?.MoveCall?.typeArguments).toEqual([`${PACKAGE_ID}::btc::BTC`]);

                expect(moveCalls.some((c) => c.MoveCall?.function === "request_withdrawal")).toBe(
                    true,
                );
            });
        });
    });
});
