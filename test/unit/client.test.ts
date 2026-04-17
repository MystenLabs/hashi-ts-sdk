import { describe, it, expect, vi, beforeEach } from "vitest";
import { HashiClient, hashi } from "../../src/client.js";
import {
    AmountBelowMinimumError,
    HashiConfigError,
    HashiPausedError,
} from "../../src/errors.js";
import { Hashi } from "../../src/contracts/hashi/hashi.js";
import { generateDepositAddress, arkworksToSec1Compressed } from "../../src/bitcoin.js";
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
const TEST_MPC_KEY = secp256k1.getPublicKey(TEST_SECRET, true); // 33 bytes, SEC1 compressed

/**
 * Arkworks-encoded form of TEST_MPC_KEY, matching the on-chain storage format.
 * Arkworks: bytes[0..32] = x in LE, byte[32] = flag (bit 7 = y > (p-1)/2).
 */
function sec1ToArkworks(sec1: Uint8Array): Uint8Array {
    const xBe = sec1.slice(1);
    const xLe = new Uint8Array(xBe).reverse();
    const Point = secp256k1.Point;
    const point = Point.fromBytes(sec1);
    const y = point.toAffine().y;
    const p = Point.CURVE().p;
    const yIsNeg = y > (p - 1n) / 2n;
    const ark = new Uint8Array(33);
    ark.set(xLe, 0);
    ark[32] = yIsNeg ? 0x80 : 0x00;
    return ark;
}
const TEST_MPC_KEY_ARKWORKS = sec1ToArkworks(TEST_MPC_KEY);

const TEST_SUI_ADDRESS = "0xabcdef0000000000000000000000000000000000000000000000000000000001";

/**
 * Build a mocked `Hashi.get()` response with a custom config `contents` array.
 * Other fields carry minimal-but-valid placeholders so the BCS-decoded json
 * shape matches what the SDK expects.
 */
function mockHashiWithConfig(
    contents: Array<{ key: string; value: { $kind: string; [k: string]: unknown } }>,
) {
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
                config: { contents },
                enabled_versions: { contents: [] },
                upgrade_cap: null,
            },
            treasury: { objects: HASHI_OBJECT_ID },
            proposals: HASHI_OBJECT_ID,
            tob: HASHI_OBJECT_ID,
            num_consumed_presigs: 0n,
        },
    } as never);
}

const WELL_FORMED_CONFIG = [
    { key: "paused", value: { $kind: "Bool", Bool: false } },
    { key: "bitcoin_chain_id", value: { $kind: "Address", Address: `0x${"a".repeat(64)}` } },
    { key: "bitcoin_deposit_minimum", value: { $kind: "U64", U64: "30000" } },
    { key: "bitcoin_withdrawal_minimum", value: { $kind: "U64", U64: "30000" } },
    { key: "bitcoin_confirmation_threshold", value: { $kind: "U64", U64: "6" } },
    { key: "withdrawal_cancellation_cooldown_ms", value: { $kind: "U64", U64: "3600000" } },
];

describe("HashiClient", () => {
    let client: SuiGrpcClient & { hashi: HashiClient };

    beforeEach(() => {
        vi.clearAllMocks();
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
                        mpc_public_key: Array.from(TEST_MPC_KEY_ARKWORKS),
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
                        mpc_public_key: Array.from(TEST_MPC_KEY_ARKWORKS),
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
        const validTxid = "0x" + "ef".repeat(32);

        it("throws HashiPausedError when the protocol is paused", async () => {
            mockHashiWithConfig([
                ...WELL_FORMED_CONFIG.filter((e) => e.key !== "paused"),
                { key: "paused", value: { $kind: "Bool", Bool: true } },
            ]);

            await expect(
                client.hashi.deposit({
                    txid: validTxid,
                    utxos: [{ vout: 0, amountSats: 100_000n }],
                    recipient: TEST_SUI_ADDRESS,
                }),
            ).rejects.toBeInstanceOf(HashiPausedError);
        });

        it("throws AmountBelowMinimumError carrying structured fields for an under-minimum UTXO", async () => {
            // WELL_FORMED_CONFIG sets bitcoin_deposit_minimum = 30_000 sats.
            mockHashiWithConfig(WELL_FORMED_CONFIG);

            const promise = client.hashi.deposit({
                txid: validTxid,
                utxos: [{ vout: 3, amountSats: 10_000n }],
                recipient: TEST_SUI_ADDRESS,
            });

            await expect(promise).rejects.toBeInstanceOf(AmountBelowMinimumError);
            await expect(promise).rejects.toMatchObject({
                amount: 10_000n,
                minimum: 30_000n,
                vout: 3,
            });
        });

        it("builds a batched PTB when all UTXOs meet the minimum", async () => {
            mockHashiWithConfig(WELL_FORMED_CONFIG);

            const tx = await client.hashi.deposit({
                txid: validTxid,
                utxos: [
                    { vout: 0, amountSats: 100_000n },
                    { vout: 1, amountSats: 50_000n },
                ],
                recipient: TEST_SUI_ADDRESS,
            });

            expect(tx).toBeInstanceOf(Transaction);
            const { commands } = tx.getData();
            expect(commands).toHaveLength(6);
            expect(commands.map((c) => c.MoveCall?.function)).toEqual([
                "utxo_id",
                "utxo",
                "deposit",
                "utxo_id",
                "utxo",
                "deposit",
            ]);
        });

        it("fetches the governance snapshot exactly once per deposit call", async () => {
            const getSpy = vi.spyOn(Hashi, "get");
            mockHashiWithConfig(WELL_FORMED_CONFIG);

            await client.hashi.deposit({
                txid: validTxid,
                utxos: [{ vout: 0, amountSats: 100_000n }],
                recipient: TEST_SUI_ADDRESS,
            });

            expect(getSpy).toHaveBeenCalledTimes(1);
        });
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
                            mpc_public_key: Array.from(TEST_MPC_KEY_ARKWORKS),
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

        describe("all / governance getters", () => {
            it("all() returns a full typed snapshot from one Hashi.get call", async () => {
                const getSpy = vi.spyOn(Hashi, "get");
                mockHashiWithConfig(WELL_FORMED_CONFIG);

                const snap = await client.hashi.view.all();

                expect(getSpy).toHaveBeenCalledTimes(1);
                expect(snap).toEqual({
                    paused: false,
                    bitcoinChainId: `0x${"a".repeat(64)}`,
                    bitcoinDepositMinimum: 30_000n,
                    bitcoinWithdrawalMinimum: 30_000n,
                    bitcoinConfirmationThreshold: 6n,
                    withdrawalCancellationCooldownMs: 3_600_000n,
                    depositMinimum: 30_000n,
                    worstCaseNetworkFee: 30_000n - 546n,
                });
            });

            it("floors bitcoin_deposit_minimum to DUST_RELAY_MIN_VALUE (546)", async () => {
                mockHashiWithConfig([
                    ...WELL_FORMED_CONFIG.filter((e) => e.key !== "bitcoin_deposit_minimum"),
                    { key: "bitcoin_deposit_minimum", value: { $kind: "U64", U64: "100" } },
                ]);

                const snap = await client.hashi.view.all();

                expect(snap.bitcoinDepositMinimum).toBe(546n);
                expect(snap.depositMinimum).toBe(546n);
            });

            it("floors bitcoin_withdrawal_minimum to DUST_RELAY_MIN_VALUE + 1 (547)", async () => {
                mockHashiWithConfig([
                    ...WELL_FORMED_CONFIG.filter((e) => e.key !== "bitcoin_withdrawal_minimum"),
                    { key: "bitcoin_withdrawal_minimum", value: { $kind: "U64", U64: "200" } },
                ]);

                const snap = await client.hashi.view.all();

                expect(snap.bitcoinWithdrawalMinimum).toBe(547n);
                expect(snap.worstCaseNetworkFee).toBe(1n); // 547 - 546
            });

            it("throws HashiConfigError naming the missing key", async () => {
                mockHashiWithConfig(WELL_FORMED_CONFIG.filter((e) => e.key !== "paused"));

                await expect(client.hashi.view.all()).rejects.toMatchObject({
                    name: "HashiConfigError",
                    key: "paused",
                    expectedVariant: "Bool",
                    message: expect.stringContaining('"paused" not found'),
                });
            });

            it("throws HashiConfigError when variant is wrong", async () => {
                mockHashiWithConfig([
                    ...WELL_FORMED_CONFIG.filter((e) => e.key !== "paused"),
                    { key: "paused", value: { $kind: "U64", U64: "1" } },
                ]);

                await expect(client.hashi.view.all()).rejects.toMatchObject({
                    name: "HashiConfigError",
                    key: "paused",
                    expectedVariant: "Bool",
                    actualVariant: "U64",
                });
            });

            it("each individual view method fetches via all() (one Hashi.get per call)", async () => {
                const getSpy = vi.spyOn(Hashi, "get");
                mockHashiWithConfig(WELL_FORMED_CONFIG);

                expect(await client.hashi.view.paused()).toBe(false);
                expect(getSpy).toHaveBeenCalledTimes(1);
            });

            it("HashiConfigError is instanceof Error and carries structured fields", async () => {
                mockHashiWithConfig(WELL_FORMED_CONFIG.filter((e) => e.key !== "paused"));

                try {
                    await client.hashi.view.all();
                    expect.fail("should have thrown");
                } catch (err) {
                    expect(err).toBeInstanceOf(Error);
                    expect(err).toBeInstanceOf(HashiConfigError);
                }
            });
        });
    });

    describe("tx", () => {
        describe("deposit", () => {
            it("composes utxo_id + utxo + deposit for a single UTXO", () => {
                const tx = client.hashi.tx.deposit({
                    txid: "0x" + "ab".repeat(32),
                    utxos: [{ vout: 0, amountSats: 100_000n }],
                    recipient: TEST_SUI_ADDRESS,
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

            it("batches multiple UTXOs into one PTB (one triple per UTXO)", () => {
                const tx = client.hashi.tx.deposit({
                    txid: "0x" + "cd".repeat(32),
                    utxos: [
                        { vout: 0, amountSats: 100_000n },
                        { vout: 2, amountSats: 50_000n },
                    ],
                    recipient: TEST_SUI_ADDRESS,
                });

                const { commands } = tx.getData();
                expect(commands).toHaveLength(6);

                const functions = commands.map((c) => c.MoveCall?.function);
                expect(functions).toEqual([
                    "utxo_id",
                    "utxo",
                    "deposit",
                    "utxo_id",
                    "utxo",
                    "deposit",
                ]);
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
