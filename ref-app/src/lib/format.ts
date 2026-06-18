export function sats(amount: bigint): string {
  const s = amount.toString();
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped} sats`;
}

export function btc(amount: bigint): string {
  const whole = amount / 100_000_000n;
  const frac = (amount % 100_000_000n).toString().padStart(8, "0");
  return `${whole}.${frac} BTC`;
}

export function truncateAddr(addr: string, head = 8, tail = 6): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Lowercase hex of a byte array (no 0x prefix). */
export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Format a ms-since-epoch timestamp (bigint or number) as a local datetime. */
export function whenMs(ms: bigint | number): string {
  return new Date(Number(ms)).toLocaleString();
}

/** Human countdown to a target ms-since-epoch (e.g. "in 2m 13s", "ready now"). */
export function untilMs(target: bigint | number, now: number = Date.now()): string {
  const diff = Number(target) - now;
  if (diff <= 0) return "ready now";
  const totalSec = Math.ceil(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m ${s}s`;
  return `in ${s}s`;
}

/** Format an elapsed duration (ms) as "45s" / "2m 13s" / "1h 4m 9s". */
export function elapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format a MIST amount with an approximate SUI value. */
export function mist(amount: bigint): string {
  const sui = Number(amount) / 1e9;
  return `${amount.toLocaleString()} MIST (~${sui.toFixed(6)} SUI)`;
}

/** True if `s` is a 0x-prefixed 32-byte hex string (a Sui address or txid). */
export function isHex32(s: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

export function describeError(err: unknown): string {
  if (err && typeof err === "object" && "constructor" in err) {
    const name = (err as { constructor: { name: string } }).constructor.name;
    const msg = (err as { message?: string }).message ?? String(err);
    return `${name}: ${msg}`;
  }
  return String(err);
}
