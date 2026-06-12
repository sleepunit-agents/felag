// lint — the merge gate of the interchange class (spec/felag-core it-lint).
// Codes: E_SCHEMA, E_DUPLICATE_ID, E_UNDECLARED_CONTRACT, E_MISSING_FIXTURES,
// E_UNKNOWN_FIXTURE; since 1.0.0 the roster checks E_DUPLICATE_IMPLEMENTER
// (ref: the duplicated name) and E_MULTIPLE_OWNERS (ref: "preamble").
// Errors sorted ascending by (code, ref).

import type {
  Criterion,
  Fixture,
  LintError,
  LintResult,
  Preamble,
  SpecRecord,
} from "./records.js";

const RECORD_TYPES = new Set(["preamble", "item", "criterion", "fixture"]);
const CRITERION_STATES = new Set(["proposed", "active", "deprecated", "disputed"]);
const CRITERION_CLASSES = new Set(["behavioral", "judgment"]);
const FORCES = new Set(["MUST", "SHOULD", "MAY"]);

function schemaErrors(r: SpecRecord, ref: string): boolean {
  const rec = r as unknown as Record<string, unknown>;
  if (!RECORD_TYPES.has(rec.record as string)) return true;
  switch (rec.record) {
    case "preamble":
      return !(
        typeof rec.name === "string" &&
        typeof rec.conformanceVersion === "string" &&
        Array.isArray(rec.goals) &&
        Array.isArray(rec.contracts) &&
        Array.isArray(rec.exclusions) &&
        Array.isArray(rec.implementers) &&
        (rec.governance === undefined ||
          (typeof rec.governance === "object" &&
            rec.governance !== null &&
            Number.isInteger((rec.governance as Record<string, unknown>).timeoutDays) &&
            ((rec.governance as Record<string, unknown>).timeoutDays as number) >= 1))
      );
    case "item":
      return !(typeof rec.id === "string" && typeof rec.title === "string" && typeof rec.body === "string");
    case "criterion":
      return !(
        typeof rec.id === "string" &&
        typeof rec.itemId === "string" &&
        CRITERION_CLASSES.has(rec.class as string) &&
        FORCES.has(rec.force as string) &&
        CRITERION_STATES.has(rec.state as string) &&
        Array.isArray(rec.fixtures)
      );
    case "fixture":
      return !(
        typeof rec.id === "string" &&
        (rec.contractId === undefined || typeof rec.contractId === "string") &&
        typeof rec.description === "string" &&
        typeof rec.format === "string" &&
        "input" in rec &&
        "expected" in rec
      );
  }
  return true;
}

export function lint(records: SpecRecord[]): LintResult {
  const errors: LintError[] = [];
  const preamble = records.find((r) => r.record === "preamble") as Preamble | undefined;
  const declared = new Set((preamble?.contracts ?? []).map((c) => c.id));
  const fixtureIds = new Set(
    records.filter((r): r is Fixture => r.record === "fixture").map((f) => f.id),
  );

  // Roster checks (1.0.0): duplicate implementer names break roster-reference
  // resolution; more than one repo-owner breaks the promotion tiebreak.
  if (preamble) {
    const names = new Set<string>();
    let owners = 0;
    for (const imp of preamble.implementers ?? []) {
      if (names.has(imp.name)) errors.push({ code: "E_DUPLICATE_IMPLEMENTER", ref: imp.name });
      names.add(imp.name);
      if ((imp.roles ?? []).includes("repo-owner")) owners++;
    }
    if (owners > 1) errors.push({ code: "E_MULTIPLE_OWNERS", ref: "preamble" });
  }

  // E_SCHEMA + E_DUPLICATE_ID
  const seen = new Set<string>();
  for (const r of records) {
    const ref = ("id" in r && typeof r.id === "string" ? r.id : r.record) as string;
    if (schemaErrors(r, ref)) errors.push({ code: "E_SCHEMA", ref });
    if ("id" in r && typeof r.id === "string") {
      if (seen.has(r.id)) errors.push({ code: "E_DUPLICATE_ID", ref: r.id });
      seen.add(r.id);
    }
  }

  for (const r of records) {
    if (r.record === "criterion") {
      const c = r as Criterion;
      // Closed-world scope: a criterion with no contractId is advisory by
      // construction, not an error. A contractId outside the allowlist is.
      if (c.contractId !== undefined && !declared.has(c.contractId)) {
        errors.push({ code: "E_UNDECLARED_CONTRACT", ref: c.id });
      }
      if (c.contractId !== undefined && declared.has(c.contractId) && c.class === "behavioral" && c.fixtures.length === 0) {
        errors.push({ code: "E_MISSING_FIXTURES", ref: c.id });
      }
      for (const fx of c.fixtures) {
        if (!fixtureIds.has(fx)) errors.push({ code: "E_UNKNOWN_FIXTURE", ref: c.id });
      }
    }
    if (r.record === "fixture") {
      const f = r as Fixture;
      // contractId optional since 0.2.0: a contract-less fixture is legal
      // (advisory criteria may reference fixtures voluntarily); when present
      // it must still be declared.
      if (f.contractId !== undefined && !declared.has(f.contractId)) {
        errors.push({ code: "E_UNDECLARED_CONTRACT", ref: f.id });
      }
    }
  }

  errors.sort((a, b) =>
    a.code !== b.code ? (a.code < b.code ? -1 : 1) : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0,
  );
  return { valid: errors.length === 0, errors };
}
