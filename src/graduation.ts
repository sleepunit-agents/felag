// graduation — how a judgment criterion becomes gateable without felag ever
// judging (spec/felag-core it-judgment, it-graduation; 3.0.0). felag never
// runs the judge: judges run outside the boundary and their verdicts arrive
// as JudgmentRecords, exactly as conformance checks arrive as
// VerificationRecords. graduate() is total, deterministic, and fixturable
// over (criterionId, implementation, records, spec) — the shape of promote
// and verify; the non-determinism (the model call) lives entirely in record
// production.

import { canonicalLine, recordHash } from "./canonical.js";
import { lint } from "./lint.js";
import { parseInstant } from "./instant.js";
import type {
  Criterion,
  Fixture,
  GraduationBasis,
  GraduationInput,
  GraduationResult,
  IngestResult,
  JudgeIdentity,
  JudgmentRecord,
  Preamble,
  SpecRecord,
  Verdict,
} from "./records.js";

const VERDICTS = new Set(["pass", "fail", "unverifiable"]);
const KINDS = new Set(["calibration", "target"]);
const HASH_RE = /^sha256:[0-9a-f]{64}$/;

// The default tolerance is pinned in the graduation wire format, not in any
// spec record (the criteriaPerItem pattern). Unanimity-of-3: disagreement at
// n=3 means the rubric is ambiguous, and an ambiguous rubric should not gate.
const DEFAULT_TOLERANCE = { runs: 3, agreement: 3 };

// Fields required on every JudgmentRecord regardless of kind.
const COMMON_FIELDS = [
  "criterionId",
  "criterionHash",
  "kind",
  "judge",
  "verdict",
  "evidence",
  "runner",
  "at",
  "attribution",
] as const;

// Kind-conditional fields: required on the named kind, forbidden on the other.
const CALIBRATION_FIELDS = ["fixtureId", "fixtureHash"] as const;
const TARGET_FIELDS = ["implementation", "conformanceVersion"] as const;

/** ingestJudgment — reuses the ingest result format and codes (it-judgment). */
export function ingestJudgment(record: unknown): IngestResult {
  const errors = new Set<string>();
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return { accepted: false, errors: ["E_SCHEMA"] };
  }
  const r = record as Record<string, unknown>;
  for (const f of COMMON_FIELDS) {
    if (!(f in r)) errors.add("E_MISSING_FIELD");
  }
  for (const f of ["criterionId", "criterionHash", "evidence", "runner", "at", "attribution"]) {
    if (f in r && typeof r[f] !== "string") errors.add("E_SCHEMA");
  }
  if ("kind" in r && !KINDS.has(r.kind as string)) errors.add("E_SCHEMA");
  if ("verdict" in r && typeof r.verdict === "string" && !VERDICTS.has(r.verdict)) {
    errors.add("E_BAD_VERDICT");
  }
  if ("verdict" in r && typeof r.verdict !== "string") errors.add("E_SCHEMA");
  // judge is structured matching plumbing: exactly {model: string}.
  if ("judge" in r) {
    const j = r.judge as Record<string, unknown> | null;
    if (
      j === null ||
      typeof j !== "object" ||
      Array.isArray(j) ||
      typeof j.model !== "string" ||
      j.model.length === 0 ||
      Object.keys(j).length !== 1
    ) {
      errors.add("E_SCHEMA");
    }
  }
  if (typeof r.criterionHash === "string" && !HASH_RE.test(r.criterionHash)) errors.add("E_SCHEMA");
  if ("fixtureHash" in r && typeof r.fixtureHash === "string" && !HASH_RE.test(r.fixtureHash)) {
    errors.add("E_SCHEMA");
  }
  // Timestamps are instants (it-verification): unparseable ats fail ingest.
  if (typeof r.at === "string" && Number.isNaN(parseInstant(r.at))) errors.add("E_SCHEMA");
  // Kind-conditional fields: calibration is implementation-free (a property
  // of the judge); target is anchor-free (a property of the conduct).
  if (r.kind === "calibration" || r.kind === "target") {
    const required = r.kind === "calibration" ? CALIBRATION_FIELDS : TARGET_FIELDS;
    const forbidden = r.kind === "calibration" ? TARGET_FIELDS : CALIBRATION_FIELDS;
    for (const f of required) {
      if (!(f in r)) errors.add("E_MISSING_FIELD");
      else if (typeof r[f] !== "string") errors.add("E_SCHEMA");
    }
    for (const f of forbidden) {
      if (f in r) errors.add("E_SCHEMA");
    }
  }
  const sorted = [...errors].sort();
  return { accepted: sorted.length === 0, errors: sorted };
}

/** Judge identity: the canonical serialization of the judge object, compared
 * for equality only — never parsed, never ranked (the two-kinds-of-names
 * doctrine: attribution stays opaque; judge is matching plumbing). */
function judgeKey(judge: JudgeIdentity): string {
  return canonicalLine(judge);
}

function fail(code: string): GraduationResult {
  return { graduated: false, errors: [code], basis: null, judges: [], window: [] };
}

// G1 — wire-format schema, hand-rolled for totality over arbitrary JSON.
function schemaValid(input: unknown): input is GraduationInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  const i = input as Record<string, unknown>;
  if (typeof i.criterionId !== "string" || typeof i.implementation !== "string") return false;
  if (!Array.isArray(i.records) || !Array.isArray(i.spec)) return false;
  for (const r of i.records) {
    if (!ingestJudgment(r).accepted) return false;
  }
  return true;
}

/** Anchor adequacy: every referenced anchor's expected parses as exactly
 * {"verdict":"pass"} or {"verdict":"fail"}, and the corpus carries at least
 * one of each. Lives here, not in lint — lint never reads payloads. */
function anchorVerdict(fx: Fixture | undefined): "pass" | "fail" | null {
  if (!fx) return null;
  const e = fx.expected as Record<string, unknown> | null;
  if (e === null || typeof e !== "object" || Array.isArray(e)) return null;
  if (Object.keys(e).length !== 1) return null;
  if (e.verdict !== "pass" && e.verdict !== "fail") return null;
  return e.verdict;
}

/** Latest record by instant; equal instants tie to the greatest array index
 * (D1's rule verbatim). Caller pre-filters; unparseable ats never qualify. */
function latestBy(records: { rec: JudgmentRecord; idx: number }[]): JudgmentRecord | undefined {
  let best: JudgmentRecord | undefined;
  let bestAt = Number.NaN;
  for (const { rec } of records) {
    const at = parseInstant(rec.at);
    if (Number.isNaN(at)) continue;
    if (!best || at >= bestAt) {
      best = rec;
      bestAt = at;
    }
  }
  return best;
}

export function graduate(input: unknown): GraduationResult {
  // G1: wire-format schema (timestamps parse per the instants rule).
  if (!schemaValid(input)) return fail("E_SCHEMA");
  // G2: without lint-validity, "the target criterion" and "the anchor named
  // F" are not well-defined.
  if (!lint(input.spec).valid) return fail("E_SPEC_INVALID");
  // G3: the criterion must exist.
  const criterion = input.spec.find(
    (r): r is Criterion => r.record === "criterion" && r.id === input.criterionId,
  );
  if (!criterion) return fail("E_UNKNOWN_CRITERION");
  // G4: graduation intent is the judgment object.
  if (criterion.judgment === undefined) return fail("E_NOT_GRADUATABLE");

  const tolerance = criterion.judgment.tolerance ?? DEFAULT_TOLERANCE;
  const criterionHash = recordHash(criterion);
  const fixturesById = new Map(
    input.spec.filter((r): r is Fixture => r.record === "fixture").map((f) => [f.id, f]),
  );
  const preamble = input.spec.find((r): r is Preamble => r.record === "preamble") as Preamble;
  const conformanceVersion = preamble.conformanceVersion;

  // Provenance is derived and loud: every distinct judge identity appearing
  // in the input's records for this criterion, with computed admissibility.
  const judgeKeys = new Map<string, JudgeIdentity>();
  for (const r of input.records) {
    if (r.criterionId === input.criterionId) judgeKeys.set(judgeKey(r.judge), r.judge);
  }

  // Corpus adequacy.
  const anchors = criterion.fixtures.map((id) => ({ id, verdict: anchorVerdict(fixturesById.get(id)) }));
  const adequate =
    anchors.length > 0 &&
    anchors.every((a) => a.verdict !== null) &&
    anchors.some((a) => a.verdict === "pass") &&
    anchors.some((a) => a.verdict === "fail");

  const result = (basis: GraduationBasis, window: GraduationResult["window"]): GraduationResult => ({
    graduated: basis === "satisfied",
    errors: [],
    basis,
    judges: [...judgeKeys.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([key, judge]) => ({ admissible: adequate && admissibleKeys.has(key), judge })),
    window,
  });

  // Admissibility: judge J is admissible iff for EVERY anchor, J's latest
  // non-stale calibration record (criterionHash current, fixtureHash equal to
  // the anchor's current canonical hash) has verdict equal to the anchor's
  // expected verdict. The bar is all anchors, exactly.
  const admissibleKeys = new Set<string>();
  if (adequate) {
    for (const [key] of judgeKeys) {
      let ok = true;
      for (const a of anchors) {
        const anchor = fixturesById.get(a.id) as Fixture;
        const currentHash = recordHash(anchor);
        const candidates = input.records
          .map((rec, idx) => ({ rec, idx }))
          .filter(
            ({ rec }) =>
              rec.kind === "calibration" &&
              rec.criterionId === input.criterionId &&
              rec.fixtureId === a.id &&
              judgeKey(rec.judge) === key &&
              rec.criterionHash === criterionHash &&
              rec.fixtureHash === currentHash,
          );
        const latest = latestBy(candidates);
        if (!latest || latest.verdict !== a.verdict) {
          ok = false;
          break;
        }
      }
      if (ok) admissibleKeys.add(key);
    }
  }

  if (!adequate) return result("corpus-inadequate", []);
  if (admissibleKeys.size === 0) return result("no-admissible-judge", []);

  // Qualifying target records: matching tuple, criterionHash current,
  // parseable at, from an admissible judge.
  const qualifying = input.records
    .map((rec, idx) => ({ rec, idx }))
    .filter(
      ({ rec }) =>
        rec.kind === "target" &&
        rec.criterionId === input.criterionId &&
        rec.implementation === input.implementation &&
        rec.conformanceVersion === conformanceVersion &&
        rec.criterionHash === criterionHash &&
        !Number.isNaN(parseInstant(rec.at)) &&
        admissibleKeys.has(judgeKey(rec.judge)),
    );

  if (qualifying.length < tolerance.runs) return result("insufficient-evidence", []);

  // Window: the latest tolerance.runs by instant, equal instants tie to the
  // greatest array index; reported in selection order (instant ascending,
  // ties by index).
  const ordered = [...qualifying].sort((a, b) => {
    const ai = parseInstant(a.rec.at);
    const bi = parseInstant(b.rec.at);
    return ai !== bi ? ai - bi : a.idx - b.idx;
  });
  const window = ordered.slice(-tolerance.runs);
  const windowOut = window.map(({ rec }) => ({
    at: rec.at,
    judge: rec.judge,
    verdict: rec.verdict as Verdict,
  }));

  // unverifiable occupies its slot and counts toward neither side: an
  // abstention is evidence of non-reproducibility — fail closed.
  const p = window.filter(({ rec }) => rec.verdict === "pass").length;
  const f = window.filter(({ rec }) => rec.verdict === "fail").length;
  const basis: GraduationBasis =
    p >= tolerance.agreement
      ? "satisfied"
      : f >= tolerance.agreement
        ? "reproducible-fail"
        : "unreproducible";
  return result(basis, windowOut);
}
