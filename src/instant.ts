// Timestamp parsing for the instant-comparison rules (it-verification
// Timestamps; it-author-promotion definitions). "Parseable" is pinned by
// the spec: RFC 3339 date-time with case-insensitive T/Z per its ABNF, an
// offset REQUIRED (bare Date.parse would read a missing offset as host-local
// time — a verdict that varies by box timezone), and second 60 excluded
// (a leap second has no instant on the POSIX scale we normalize to).

const RFC3339 =
  /^\d{4}-\d{2}-\d{2}[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

/** UTC-normalized instant in epoch ms, or NaN if not parseable. */
export function parseInstant(s: string): number {
  const m = RFC3339.exec(s);
  if (!m) return Number.NaN;
  if (m[3] === "60") return Number.NaN; // leap second: excluded, no instant
  return Date.parse(s.toUpperCase());
}
