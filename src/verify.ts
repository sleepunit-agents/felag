// verify — a ledger, not a runner (spec/felag-core it-verification, D1–D6).
// Ingests externally-produced VerificationRecords and derives conformance.

import { fixtureHash } from "./canonical.js";
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
  const sorted = [...errors].sort();
  return { accepted: sorted.length === 0, errors: sorted };
}

/** Gating per it-gating: behavioral MUST, declared contract, state active or
 * disputed — disputed gates everyone except the disputer. */
function gates(c: Criterion, declared: Set<string>, implementation: string): boolean {
  if (c.class !== "behavioral" || c.force !== "MUST") return false;
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
  let bestIdx = -1;
  records.forEach((r, idx) => {
    if (r.criterionId !== criterionId) return;
    if (fixtureId !== undefined && r.fixtureId !== fixtureId) return;
    if (r.implementation !== implementation) return;
    if (r.conformanceVersion !== conformanceVersion) return;
    if (!best || r.at > best.at || (r.at === best.at && idx > bestIdx)) {
      best = r;
      bestIdx = idx;
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

  for (const c of criteria) {
    if (!gates(c, declared, input.implementation)) continue;
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
    // D2: unexpired waiver (kind waiver or known-bug) covers it.
    const hasWaiver = waivers.some(
      (w: Waiver) =>
        w.criterionId === c.id &&
        w.implementation === input.implementation &&
        (w.kind === "waiver" || w.kind === "known-bug") &&
        w.expiresAt > input.asOf,
    );
    if (hasWaiver) waived.push(c.id);
    else failing.push(c.id);
  }

  // D4: disputed criteria are listed for every implementation — loud everywhere.
  const disputed = criteria.filter((c) => c.state === "disputed").map((c) => c.id);

  // D4: advisory — judgment criteria that have records, with their latest verdicts.
  const advisory: { criterionId: string; verdict: VerificationRecord["verdict"] }[] = [];
  for (const c of criteria) {
    if (c.class !== "judgment") continue;
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
