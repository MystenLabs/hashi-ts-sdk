import { describe, it, beforeEach } from "vitest";
import { HashiClient, hashi } from "../../src/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";

describe("HashiClient", () => {
    let client: SuiGrpcClient & { hashi: HashiClient };

    beforeEach(() => {
        client = new SuiGrpcClient({
            network: "testnet",
            baseUrl: "https://fullnode.testnet.sui.io:443",
        }).$extend(hashi());
    });

    describe("generateDepositAddress", () => {
        it.todo("generates a deposit address");
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
