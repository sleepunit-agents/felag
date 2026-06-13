// verify — a ledger, not a runner (spec/felag-core it-verification, D1–D6).
// Ingests externally-produced VerificationRecords and derives conformance.

import { fixtureHash } from "./canonical.js";
import { graduate } from "./graduation.js";
import { parseInstant } from "./instant.js";
import type {
  ConformanceReport,
  Criterion,
  Fixture,
  IngestResult,
  Preamble,
  SpecRecord,
  VerificationRecord,
  VerifyInput,
  Waiver,
} from "./records.js";

const REQUIRED_FIELDS = [
  "criterionId",
  "implementation",
  "implementationVersion",
  "conformanceVersion",
  "verdict",
  "evidence",
  "runner",
  "at",
  "attribution",
] as const;

const VERDICTS = new Set(["pass", "fail", "unverifiable"]);

export function ingest(record: unknown): IngestResult {
  const errors = new Set<string>();
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return { accepted: false, errors: ["E_SCHEMA"] };
  }
  const r = record as Record<string, unknown>;
  for (const f of REQUIRED_FIELDS) {
    if (!(f in r)) errors.add("E_MISSING_FIELD");
    else if (typeof r[f] !== "string") errors.add("E_SCHEMA");
  }
  if (typeof r.verdict === "string" && !VERDICTS.has(r.verdict)) errors.add("E_BAD_VERDICT");
  // Timestamps are instants: an at that does not parse as RFC 3339 cannot
  // participate in D1's instant ordering — reject at the front door.
  if (typeof r.at === "string" && Number.isNaN(parseInstant(r.at))) errors.add("E_SCHEMA");
  const sorted = [...errors].sort();
  return { accepted: sorted.length === 0, errors: sorted };
}

/** Gating per it-gating: MUST, declared contract, state active or disputed
 * (disputed gates everyone except the disputer), and class behavioral OR
 * class judgment carrying a judgment object (graduatable, 3.0.0). */
function gates(c: Criterion, declared: Set<string>, implementation: string): boolean {
  if (c.force !== "MUST") return false;
  if (c.class === "judgment" && c.judgment === undefined) return false;
  if (c.contractId === undefined || !declared.has(c.contractId)) return false;
  if (c.state === "active") return true;
  if (c.state === "disputed") return c.dispute?.by !== implementation;
  return false;
}

function latestRecord(
  records: VerificationRecord[],
  criterionId: string,
  fixtureId: string | undefined,
  implementation: string,
  conformanceVersion: string,
): VerificationRecord | undefined {
  let best: VerificationRecord | undefined;
  let bestAt = Number.NaN;
  records.forEach((r, idx) => {
    if (r.criterionId !== criterionId) return;
    if (fixtureId !== undefined && r.fixtureId !== fixtureId) return;
    if (r.implementation !== implementation) return;
    if (r.conformanceVersion !== conformanceVersion) return;
    // Instant order after UTC normalization, never lexical (non-Z offsets
    // and sub-second precision diverge); unparseable ats are ignored.
    // Equal instants tie to the last submitted (idx ascending).
    const at = parseInstant(r.at);
    if (Number.isNaN(at)) return;
    if (!best || at >= bestAt) {
      best = r;
      bestAt = at;
    }
  });
  return best;
}

export function verify(input: VerifyInput): ConformanceReport {
  const spec = input.spec;
  const preamble = spec.find((r) => r.record === "preamble") as Preamble;
  const declared = new Set(preamble.contracts.map((c) => c.id));
  const criteria = spec.filter((r): r is Criterion => r.record === "criterion");
  const fixturesById = new Map(
    spec.filter((r): r is Fixture => r.record === "fixture").map((f) => [f.id, f]),
  );
  const waivers = input.waivers ?? [];
  const conformanceVersion = preamble.conformanceVersion;

  const failing: string[] = [];
  const waived: string[] = [];

  // D2: unexpired waiver (kind waiver or known-bug) covers an unsatisfied
  // criterion. Instant comparison; an unparseable expiresAt is expired (fail
  // closed — a malformed waiver waives nothing).
  const hasWaiver = (criterionId: string): boolean =>
    waivers.some(
      (w: Waiver) =>
        w.criterionId === criterionId &&
        w.implementation === input.implementation &&
        (w.kind === "waiver" || w.kind === "known-bug") &&
        parseInstant(w.expiresAt) > parseInstant(input.asOf),
    );

  for (const c of criteria) {
    if (!gates(c, declared, input.implementation)) continue;
    // D1J (3.0.0): a gating judgment criterion is satisfied iff the
    // graduation function returns graduated for it over the input's
    // judgment records; D2 and D3 then apply to it unchanged.
    if (c.class === "judgment") {
      const grad = graduate({
        criterionId: c.id,
        implementation: input.implementation,
        records: input.judgmentRecords ?? [],
        spec: input.spec,
      });
      if (!grad.graduated) {
        if (hasWaiver(c.id)) waived.push(c.id);
        else failing.push(c.id);
      }
      continue;
    }
    // D1: satisfied iff every referenced fixture's latest matching record passes;
    // stale-hash records (fixtureHash present and ≠ current canonical hash) ignored.
    let satisfied = true;
    for (const fxId of c.fixtures) {
      const candidates = input.records.filter((r) => {
        if (r.fixtureHash !== undefined) {
          const fx = fixturesById.get(fxId);
          if (fx && r.fixtureHash !== fixtureHash(fx)) return false; // stale
        }
        return true;
      });
      const latest = latestRecord(candidates, c.id, fxId, input.implementation, conformanceVersion);
      if (!latest || latest.verdict !== "pass") {
        satisfied = false;
        break;
      }
    }
    if (satisfied) continue;
    if (hasWaiver(c.id)) waived.push(c.id);
    else failing.push(c.id);
  }

  // D4: disputed criteria are listed for every implementation — loud everywhere.
  const disputed = criteria.filter((c) => c.state === "disputed").map((c) => c.id);

  // D4: advisory — NON-GRADUATABLE judgment criteria (no judgment object)
  // that have records, with their latest VerificationRecord-borne verdicts.
  // Graduatable criteria never appear here: gating ones live in
  // failing/waived; non-gating ones have the graduation result as their own
  // diagnostic surface.
  const advisory: { criterionId: string; verdict: VerificationRecord["verdict"] }[] = [];
  for (const c of criteria) {
    if (c.class !== "judgment" || c.judgment !== undefined) continue;
    const latest = latestRecord(input.records, c.id, undefined, input.implementation, conformanceVersion);
    if (latest) advisory.push({ criterionId: c.id, verdict: latest.verdict });
  }
  advisory.sort((a, b) => (a.criterionId < b.criterionId ? -1 : 1));

  // D3: verdict precedence drifts > conforms-with-waivers > conforms.
  const verdict =
    failing.length > 0 ? "drifts" : waived.length > 0 ? "conforms-with-waivers" : "conforms";

  return {
    advisory,
    conformanceVersion,
    disputed: disputed.sort(),
    failing: failing.sort(),
    implementation: input.implementation,
    verdict,
    waived: waived.sort(),
  };
}
