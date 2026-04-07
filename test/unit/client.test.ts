import { describe, it, expect, vi, beforeEach } from "vitest";
import { HashiClient, hashi } from "../../src/client.js";
import { Hashi } from "../../src/contracts/hashi/hashi.js";
import { generateDepositAddress } from "../../src/bitcoin.js";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { fromHex } from "@mysten/sui/utils";

const HASHI_OBJECT_ID =
    "0x0000000000000000000000000000000000000000000000000000000000000001";

/** Deterministic test key: secret = 2 (matches TEST_HASHI_BTC_SK in Rust tests). */
const TEST_SECRET = new Uint8Array(32);
TEST_SECRET[31] = 2;
const TEST_MPC_KEY = secp256k1.getPublicKey(TEST_SECRET, true); // 33 bytes

const TEST_SUI_ADDRESS =
    "0xabcdef0000000000000000000000000000000000000000000000000000000001";

describe("HashiClient", () => {
    let client: SuiGrpcClient & { hashi: HashiClient };

    beforeEach(() => {
        client = new SuiGrpcClient({
            network: "devnet",
            baseUrl: "https://fullnode.devnet.sui.io:443",
        }).$extend(hashi({ hashiObjectId: HASHI_OBJECT_ID, network: "regtest" }));
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
                    config: { config: { contents: [] }, enabled_versions: { contents: [] }, upgrade_cap: null },
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
                    config: { config: { contents: [] }, enabled_versions: { contents: [] }, upgrade_cap: null },
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
                    config: { config: { contents: [] }, enabled_versions: { contents: [] }, upgrade_cap: null },
                    treasury: { objects: HASHI_OBJECT_ID },
                    proposals: HASHI_OBJECT_ID,
                    tob: HASHI_OBJECT_ID,
                    num_consumed_presigs: 0n,
                },
            } as never);

            // Client default is regtest, but we override to testnet
            const addr = await client.hashi.generateDepositAddress({
                suiAddress: TEST_SUI_ADDRESS,
                network: "testnet",
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

    describe("view", () => {
        it.todo("bitcoinDepositMinimum");
        it.todo("bitcoinWithdrawalMinimum");
        it.todo("bitcoinConfirmationThreshold");
        it.todo("paused");
        it.todo("withdrawalCancellationCooldownMs");
        it.todo("bitcoinChainId");
        it.todo("depositMinimum");
        it.todo("worstCaseNetworkFee");
    });
});
