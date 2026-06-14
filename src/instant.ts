// Timestamp parsing for the instant-comparison rules (it-verification
// Timestamps; it-author-promotion definitions). "Parseable" is pinned by
// the spec: RFC 3339 date-time with case-insensitive T/Z per its ABNF, an
// offset REQUIRED (bare Date.parse would read a missing offset as host-local
// time — a verdict that varies by box timezone), and second 60 excluded
// (a leap second has no instant on the POSIX scale we normalize to).

const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** UTC-normalized instant in epoch ms, or NaN if not parseable.
 *
 * "Parseable" is pinned, not delegated. Two guarantees the host Date parser
 * does not give us on its own:
 *  - Calendar validity: an RFC 3339-SHAPED string that names no real instant
 *    (2026-02-30, month 13, hour 24, minute 60) is rejected here, never passed
 *    to Date.parse — whose out-of-range rollover (Feb 30 → Mar 2) is engine-
 *    defined and would let the same fixture yield different verdicts across
 *    implementations.
 *  - Millisecond precision: any sub-millisecond fraction is TRUNCATED (not
 *    rounded) to three digits before normalization. Comparison resolution is
 *    the millisecond; two timestamps differing only below the millisecond are
 *    the same instant on every host. (it-verification Timestamps.) */
export function parseInstant(s: string): number {
  const m = RFC3339.exec(s);
  if (!m) return Number.NaN;
  const year = +m[1];
  const month = +m[2];
  const day = +m[3];
  const hour = +m[4];
  const minute = +m[5];
  const second = +m[6];
  if (month < 1 || month > 12) return Number.NaN;
  if (hour > 23 || minute > 59) return Number.NaN;
  if (second > 59) return Number.NaN; // 60 is a leap second (no POSIX instant); >60 impossible
  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) return Number.NaN;
  // Reassemble from validated fields, truncating the fraction to milliseconds
  // and upper-casing the designator, so Date.parse only ever sees a canonical,
  // sub-millisecond-free, in-range instant.
  const frac = m[7] ? m[7].slice(0, 4) : ""; // ".d" → keep at most 3 fraction digits
  const normalized = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${frac}${m[8].toUpperCase()}`;
  return Date.parse(normalized);
}
