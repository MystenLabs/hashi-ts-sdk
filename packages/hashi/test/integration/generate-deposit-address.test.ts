import { describe, it, expect } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { isLocalnet, makeClient } from "./_env.js";

/**
 * Replaces `_show-address.test.ts`. Asserts that `generateDepositAddress`
 * returns a P2TR taproot address with the correct human-readable prefix
 * for the configured Bitcoin network — `bcrt1p…` on regtest (localnet),
 * `tb1p…` on signet/testnet (devnet). Both targets exercise the same
 * SDK code path: only the on-chain MPC key + bitcoin-network hint differ.
 *
 * Pure address derivation — no signing, no funding. A generated keypair's
 * Sui address is the only input that matters; the test never submits a tx.
 */
describe("HashiClient.generateDepositAddress (real network)", () => {
    it("returns a P2TR address whose HRP matches the configured Bitcoin network", async () => {
        const client = makeClient();
        const suiAddress = Ed25519Keypair.generate().toSuiAddress();

        const btcAddress = await client.hashi.generateDepositAddress({ suiAddress });

        const expectedPrefix = isLocalnet() ? "bcrt1p" : "tb1p";
        expect(btcAddress.startsWith(expectedPrefix)).toBe(true);
    }, 30_000);
});
