import type { BitcoinNetwork } from "@mysten-incubation/hashi";

/**
 * Minimal client for mempool.space's public REST API, used by §4 to look up the
 * UTXOs funding a deposit address and auto-fill the record-deposit form.
 *
 * Why this lives in the ref-app and not the SDK: the SDK's `bitcoin.*` helpers
 * talk to a Bitcoin Core JSON-RPC node (`btcRpcUrl`), and a browser calling Core
 * directly hits CORS. mempool.space's REST API is CORS-enabled, so the browser
 * can fetch it with no proxy and no `btcRpcUrl` — a demo convenience, not SDK
 * surface.
 */

/** A UTXO as returned by `GET /address/{addr}/utxo`. */
export interface MempoolUtxo {
    /** Funding txid in display order (mempool's form), no `0x` prefix. */
    txid: string;
    vout: number;
    /** Output value in sats. */
    value: number;
    status: { confirmed: boolean };
}

/** UTXOs from one funding tx — the unit §4's single-`txid` form can submit at once. */
export interface FundingGroup {
    /** Funding txid in display order, no `0x` prefix. */
    txid: string;
    confirmed: boolean;
    utxos: { vout: number; value: number }[];
}

/**
 * mempool.space API base for a Sui-configured Bitcoin network, or `null` when
 * there is no public explorer for it (regtest).
 */
export function mempoolBase(network: BitcoinNetwork): string | null {
    switch (network) {
        case "mainnet":
            return "https://mempool.space/api";
        case "testnet":
            return "https://mempool.space/testnet/api";
        case "signet":
            return "https://mempool.space/signet/api";
        case "regtest":
            return null;
    }
}

/**
 * Fetch the UTXOs paying `address`. Throws on an unsupported network (regtest)
 * or a non-2xx response.
 */
export async function fetchAddressUtxos(
    network: BitcoinNetwork,
    address: string,
): Promise<MempoolUtxo[]> {
    const base = mempoolBase(network);
    if (!base) {
        throw new Error(
            "Auto-fill needs a public explorer; not available on regtest. Enter the funding tx manually, or set VITE_BTC_RPC_URL to use the §3 RPC lookup.",
        );
    }
    const res = await fetch(`${base}/address/${address}/utxo`);
    if (!res.ok) {
        throw new Error(`mempool.space lookup failed (HTTP ${res.status} ${res.statusText}).`);
    }
    return (await res.json()) as MempoolUtxo[];
}

/** Sum a group's output values, in sats. */
function groupValue(g: FundingGroup): number {
    return g.utxos.reduce((sum, u) => sum + u.value, 0);
}

/**
 * Group UTXOs by funding txid and pick one group to fill the form with —
 * confirmed txs first, then the largest by total value. All UTXOs in a group
 * share a txid and therefore the same confirmation status. `otherTxCount` is how
 * many *other* funding txs remain (the form records one tx per submit).
 */
export function pickFundingGroup(utxos: MempoolUtxo[]): {
    group: FundingGroup | null;
    otherTxCount: number;
} {
    const groups = new Map<string, FundingGroup>();
    for (const u of utxos) {
        let g = groups.get(u.txid);
        if (!g) {
            g = { txid: u.txid, confirmed: u.status.confirmed, utxos: [] };
            groups.set(u.txid, g);
        }
        g.utxos.push({ vout: u.vout, value: u.value });
    }
    const all = [...groups.values()].sort((a, b) => {
        if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
        return groupValue(b) - groupValue(a);
    });
    return { group: all[0] ?? null, otherTxCount: Math.max(0, all.length - 1) };
}
