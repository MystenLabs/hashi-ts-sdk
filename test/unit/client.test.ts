import { describe, it, expect, vi, beforeEach } from "vitest";
import { HashiClient, hashi } from "../../src/client.js";
import {
    AmountBelowMinimumError,
    HashiConfigError,
    HashiPausedError,
    InvalidBitcoinAddressError,
    InvalidParamsError,
} from "../../src/errors.js";
import { Hashi } from "../../src/contracts/hashi/hashi.js";
import { generateDepositAddress } from "../../src/bitcoin.js";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bech32, bech32m } from "@scure/base";
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
        const testSigner = Ed25519Keypair.generate();

        // Stub the network call so happy-path tests don't hit a real node.
        // Spy on `client.core` (the raw CoreClient instance) rather than
        // `client` itself — `$extend` wraps the client in a Proxy that caches
        // bound method references, so a spy installed on the Proxy gets
        // shadowed by the cache on subsequent reads. The underlying target is
        // reachable via `client.core` since `CoreClient` sets `core = this`,
        // and `HashiClient` stores that same target internally.
        let signExecSpy: ReturnType<typeof vi.spyOn>;
        beforeEach(() => {
            signExecSpy = vi.spyOn(client.core, "signAndExecuteTransaction").mockResolvedValue({
                $kind: "Transaction",
                Transaction: { status: { success: true } },
            } as never);
        });

        it("throws HashiPausedError when the protocol is paused", async () => {
            mockHashiWithConfig([
                ...WELL_FORMED_CONFIG.filter((e) => e.key !== "paused"),
                { key: "paused", value: { $kind: "Bool", Bool: true } },
            ]);

            const promise = client.hashi.deposit({
                signer: testSigner,
                txid: validTxid,
                utxos: [{ vout: 0, amountSats: 100_000n }],
                recipient: TEST_SUI_ADDRESS,
            });

            await expect(promise).rejects.toBeInstanceOf(HashiPausedError);
            await expect(promise).rejects.toMatchObject({ operation: "deposit" });
            expect(signExecSpy).not.toHaveBeenCalled();
        });

        it("prefers HashiPausedError over AmountBelowMinimumError when both would apply", async () => {
            // Pause check must run before the minimum check — if these two
            // fired in the wrong order a user depositing dust into a paused
            // system would see the wrong recovery signal.
            mockHashiWithConfig([
                ...WELL_FORMED_CONFIG.filter((e) => e.key !== "paused"),
                { key: "paused", value: { $kind: "Bool", Bool: true } },
            ]);

            await expect(
                client.hashi.deposit({
                    signer: testSigner,
                    txid: validTxid,
                    utxos: [{ vout: 0, amountSats: 1n }], // well below 30 000
                    recipient: TEST_SUI_ADDRESS,
                }),
            ).rejects.toBeInstanceOf(HashiPausedError);
        });

        it("throws AmountBelowMinimumError carrying every violation for an under-minimum batch", async () => {
            // WELL_FORMED_CONFIG sets bitcoin_deposit_minimum = 30_000 sats.
            mockHashiWithConfig(WELL_FORMED_CONFIG);

            const promise = client.hashi.deposit({
                signer: testSigner,
                txid: validTxid,
                utxos: [
                    { vout: 1, amountSats: 10_000n },
                    { vout: 3, amountSats: 50_000n }, // passes
                    { vout: 7, amountSats: 20_000n },
                ],
                recipient: TEST_SUI_ADDRESS,
            });

            await expect(promise).rejects.toBeInstanceOf(AmountBelowMinimumError);
            await expect(promise).rejects.toMatchObject({
                violations: [
                    { amount: 10_000n, minimum: 30_000n, vout: 1 },
                    { amount: 20_000n, minimum: 30_000n, vout: 7 },
                ],
            });
            expect(signExecSpy).not.toHaveBeenCalled();
        });

        it("accepts a UTXO at exactly the minimum (boundary = pass)", async () => {
            mockHashiWithConfig(WELL_FORMED_CONFIG);
            await client.hashi.deposit({
                signer: testSigner,
                txid: validTxid,
                utxos: [{ vout: 0, amountSats: 30_000n }],
                recipient: TEST_SUI_ADDRESS,
            });
            expect(signExecSpy).toHaveBeenCalledTimes(1);
        });

        it("rejects a UTXO one sat below the minimum (boundary = fail)", async () => {
            mockHashiWithConfig(WELL_FORMED_CONFIG);
            await expect(
                client.hashi.deposit({
                    signer: testSigner,
                    txid: validTxid,
                    utxos: [{ vout: 0, amountSats: 29_999n }],
                    recipient: TEST_SUI_ADDRESS,
                }),
            ).rejects.toBeInstanceOf(AmountBelowMinimumError);
        });

        it("forwards the built PTB and the provided signer to signAndExecuteTransaction", async () => {
            // PTB shape is exhaustively covered by `tx.deposit` tests; here we
            // just verify the surface method hands off correctly.
            mockHashiWithConfig(WELL_FORMED_CONFIG);

            await client.hashi.deposit({
                signer: testSigner,
                txid: validTxid,
                utxos: [
                    { vout: 0, amountSats: 100_000n },
                    { vout: 1, amountSats: 50_000n },
                ],
                recipient: TEST_SUI_ADDRESS,
            });

            expect(signExecSpy).toHaveBeenCalledTimes(1);
            const call = signExecSpy.mock.calls[0][0] as {
                signer: unknown;
                transaction: Transaction;
            };
            expect(call.signer).toBe(testSigner);
            expect(call.transaction).toBeInstanceOf(Transaction);
            expect(call.transaction.getData().commands).toHaveLength(6);
        });

        it("fetches the governance snapshot exactly once per deposit call", async () => {
            const getSpy = vi.spyOn(Hashi, "get");
            mockHashiWithConfig(WELL_FORMED_CONFIG);

            await client.hashi.deposit({
                signer: testSigner,
                txid: validTxid,
                utxos: [{ vout: 0, amountSats: 100_000n }],
                recipient: TEST_SUI_ADDRESS,
            });

            expect(getSpy).toHaveBeenCalledTimes(1);
        });

        describe("structural validation (no chain read)", () => {
            it("rejects a malformed txid before reading chain state", async () => {
                const getSpy = vi.spyOn(Hashi, "get");
                await expect(
                    client.hashi.deposit({
                        signer: testSigner,
                        txid: "0xabc", // too short
                        utxos: [{ vout: 0, amountSats: 100_000n }],
                        recipient: TEST_SUI_ADDRESS,
                    }),
                ).rejects.toBeInstanceOf(InvalidParamsError);
                expect(getSpy).not.toHaveBeenCalled();
                expect(signExecSpy).not.toHaveBeenCalled();
            });

            it("rejects a malformed recipient", async () => {
                await expect(
                    client.hashi.deposit({
                        signer: testSigner,
                        txid: validTxid,
                        utxos: [{ vout: 0, amountSats: 100_000n }],
                        recipient: "not-a-sui-address",
                    }),
                ).rejects.toBeInstanceOf(InvalidParamsError);
                expect(signExecSpy).not.toHaveBeenCalled();
            });

            it("rejects an empty utxos array", async () => {
                await expect(
                    client.hashi.deposit({
                        signer: testSigner,
                        txid: validTxid,
                        utxos: [],
                        recipient: TEST_SUI_ADDRESS,
                    }),
                ).rejects.toMatchObject({
                    name: "InvalidParamsError",
                    reason: expect.stringContaining("at least one UTXO"),
                });
                expect(signExecSpy).not.toHaveBeenCalled();
            });

            it("rejects duplicate vouts within a single deposit", async () => {
                await expect(
                    client.hashi.deposit({
                        signer: testSigner,
                        txid: validTxid,
                        utxos: [
                            { vout: 0, amountSats: 100_000n },
                            { vout: 0, amountSats: 50_000n },
                        ],
                        recipient: TEST_SUI_ADDRESS,
                    }),
                ).rejects.toMatchObject({
                    name: "InvalidParamsError",
                    reason: expect.stringContaining("duplicate `vout`"),
                });
                expect(signExecSpy).not.toHaveBeenCalled();
            });

            it("rejects a non-integer vout", async () => {
                await expect(
                    client.hashi.deposit({
                        signer: testSigner,
                        txid: validTxid,
                        utxos: [{ vout: 1.5, amountSats: 100_000n }],
                        recipient: TEST_SUI_ADDRESS,
                    }),
                ).rejects.toBeInstanceOf(InvalidParamsError);
                expect(signExecSpy).not.toHaveBeenCalled();
            });

            it("rejects a negative vout", async () => {
                await expect(
                    client.hashi.deposit({
                        signer: testSigner,
                        txid: validTxid,
                        utxos: [{ vout: -1, amountSats: 100_000n }],
                        recipient: TEST_SUI_ADDRESS,
                    }),
                ).rejects.toBeInstanceOf(InvalidParamsError);
                expect(signExecSpy).not.toHaveBeenCalled();
            });
        });
    });

    describe("requestWithdrawal", () => {
        const testSigner = Ed25519Keypair.generate();

        // Test client is configured for `bitcoinNetwork: "regtest"` (see outer
        // beforeEach), so valid deposit addresses must use the `bcrt` HRP.
        const VALID_REGTEST_P2WPKH = bech32.encode("bcrt" as const, [
            0,
            ...bech32.toWords(new Uint8Array(20).fill(0xaa)),
        ]);
        const VALID_REGTEST_P2TR = bech32m.encode("bcrt" as const, [
            1,
            ...bech32m.toWords(new Uint8Array(32).fill(0xbb)),
        ]);

        let signExecSpy: ReturnType<typeof vi.spyOn>;
        beforeEach(() => {
            signExecSpy = vi.spyOn(client.core, "signAndExecuteTransaction").mockResolvedValue({
                $kind: "Transaction",
                Transaction: { status: { success: true } },
            } as never);
        });

        it("rejects a malformed address before reading chain state", async () => {
            const getSpy = vi.spyOn(Hashi, "get");
            await expect(
                client.hashi.requestWithdrawal({
                    signer: testSigner,
                    amountSats: 100_000n,
                    bitcoinAddress: "not-an-address",
                }),
            ).rejects.toBeInstanceOf(InvalidBitcoinAddressError);
            expect(getSpy).not.toHaveBeenCalled();
            expect(signExecSpy).not.toHaveBeenCalled();
        });

        it("rejects a wrong-network address with code `wrong-network`", async () => {
            // Mainnet P2WPKH passed to a regtest-configured client.
            await expect(
                client.hashi.requestWithdrawal({
                    signer: testSigner,
                    amountSats: 100_000n,
                    bitcoinAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
                }),
            ).rejects.toMatchObject({
                name: "InvalidBitcoinAddressError",
                code: "wrong-network",
            });
            expect(signExecSpy).not.toHaveBeenCalled();
        });

        it("throws HashiPausedError when the protocol is paused", async () => {
            mockHashiWithConfig([
                ...WELL_FORMED_CONFIG.filter((e) => e.key !== "paused"),
                { key: "paused", value: { $kind: "Bool", Bool: true } },
            ]);
            const promise = client.hashi.requestWithdrawal({
                signer: testSigner,
                amountSats: 100_000n,
                bitcoinAddress: VALID_REGTEST_P2TR,
            });
            await expect(promise).rejects.toBeInstanceOf(HashiPausedError);
            await expect(promise).rejects.toMatchObject({ operation: "withdraw" });
            expect(signExecSpy).not.toHaveBeenCalled();
        });

        it("throws AmountBelowMinimumError with a single vout-less violation", async () => {
            mockHashiWithConfig(WELL_FORMED_CONFIG);

            let caught: AmountBelowMinimumError | undefined;
            try {
                await client.hashi.requestWithdrawal({
                    signer: testSigner,
                    amountSats: 29_999n, // one below 30_000 (WELL_FORMED_CONFIG)
                    bitcoinAddress: VALID_REGTEST_P2TR,
                });
                expect.fail("expected to throw");
            } catch (err) {
                caught = err as AmountBelowMinimumError;
            }

            expect(caught).toBeInstanceOf(AmountBelowMinimumError);
            expect(caught!.violations).toHaveLength(1);
            expect(caught!.violations[0]).toEqual({
                amount: 29_999n,
                minimum: 30_000n,
            });
            // Withdrawal violation carries no `vout` — the optional field is
            // absent rather than set to anything falsy-but-present.
            expect(caught!.violations[0].vout).toBeUndefined();
            // And the rendered message reflects that (no "UTXO at vout" prefix).
            expect(caught!.message).toMatch(/^Amount 29999 sats/);
            expect(signExecSpy).not.toHaveBeenCalled();
        });

        it("accepts an amount exactly at the minimum (boundary = pass)", async () => {
            mockHashiWithConfig(WELL_FORMED_CONFIG);
            await client.hashi.requestWithdrawal({
                signer: testSigner,
                amountSats: 30_000n,
                bitcoinAddress: VALID_REGTEST_P2TR,
            });
            expect(signExecSpy).toHaveBeenCalledTimes(1);
        });

        it("forwards the built PTB and the provided signer to signAndExecuteTransaction", async () => {
            mockHashiWithConfig(WELL_FORMED_CONFIG);
            await client.hashi.requestWithdrawal({
                signer: testSigner,
                amountSats: 100_000n,
                bitcoinAddress: VALID_REGTEST_P2WPKH,
            });

            expect(signExecSpy).toHaveBeenCalledTimes(1);
            const call = signExecSpy.mock.calls[0][0] as {
                signer: unknown;
                transaction: Transaction;
            };
            expect(call.signer).toBe(testSigner);
            expect(call.transaction).toBeInstanceOf(Transaction);
        });

        it("fetches the governance snapshot exactly once per call", async () => {
            const getSpy = vi.spyOn(Hashi, "get");
            mockHashiWithConfig(WELL_FORMED_CONFIG);

            await client.hashi.requestWithdrawal({
                signer: testSigner,
                amountSats: 100_000n,
                bitcoinAddress: VALID_REGTEST_P2TR,
            });

            expect(getSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("cancelWithdrawal", () => {
        const testSigner = Ed25519Keypair.generate();

        let signExecSpy: ReturnType<typeof vi.spyOn>;
        beforeEach(() => {
            signExecSpy = vi.spyOn(client.core, "signAndExecuteTransaction").mockResolvedValue({
                $kind: "Transaction",
                Transaction: { status: { success: true } },
            } as never);
        });

        it("rejects a malformed requestId before any chain or tx work", async () => {
            const getSpy = vi.spyOn(Hashi, "get");
            await expect(
                client.hashi.cancelWithdrawal({
                    signer: testSigner,
                    requestId: "0xabc", // too short
                }),
            ).rejects.toBeInstanceOf(InvalidParamsError);
            expect(getSpy).not.toHaveBeenCalled();
            expect(signExecSpy).not.toHaveBeenCalled();
        });

        it("happy path: forwards signer + a 3-command PTB to signAndExecuteTransaction", async () => {
            await client.hashi.cancelWithdrawal({
                signer: testSigner,
                requestId: REQUEST_ID,
            });

            expect(signExecSpy).toHaveBeenCalledTimes(1);
            const call = signExecSpy.mock.calls[0][0] as {
                signer: unknown;
                transaction: Transaction;
            };
            expect(call.signer).toBe(testSigner);
            expect(call.transaction).toBeInstanceOf(Transaction);
            // `tx.cancelWithdrawal` composes cancel_withdrawal + from_balance +
            // transferObjects — 3 commands total.
            expect(call.transaction.getData().commands).toHaveLength(3);
        });

        it("does not pause-check (Move permits cancellation while paused)", async () => {
            // Move's `cancel_withdrawal` has no `assert_unpaused` call, so the
            // SDK mirrors that by skipping the governance fetch entirely —
            // users must be able to unwind a pending request even if the
            // system is paused.
            const getSpy = vi.spyOn(Hashi, "get");
            await client.hashi.cancelWithdrawal({
                signer: testSigner,
                requestId: REQUEST_ID,
            });
            expect(getSpy).not.toHaveBeenCalled();
            expect(signExecSpy).toHaveBeenCalledTimes(1);
        });

        it("passes the signer's Sui address as recipient to tx.cancelWithdrawal", async () => {
            const txSpy = vi.spyOn(client.hashi.tx, "cancelWithdrawal");
            await client.hashi.cancelWithdrawal({
                signer: testSigner,
                requestId: REQUEST_ID,
            });
            expect(txSpy).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                recipient: testSigner.toSuiAddress(),
            });
        });
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
