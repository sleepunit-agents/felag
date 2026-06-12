// promotion — ratification as a total, deterministic function
// (spec/felag-core it-author-promotion; design draft v0.4 §2).
// Three structural guards, then independent error predicates; the result's
// errors is the sorted set of every predicate that holds. Rules never
// interact; E_VETOED and E_PENDING co-fire when both hold.

import { recordHash } from "./canonical.js";
import { lint } from "./lint.js";
import type {
  Acknowledgment,
  Criterion,
  Preamble,
  PromotionInput,
  PromotionResult,
  SpecRecord,
  Waiver,
} from "./records.js";

const TRANSITIONS = new Set(["active", "rejected", "known-bug"]);
const KNOWN_BUG_FIELDS = ["implementation", "justification", "expiresAt", "attribution"] as const;

function fail(errors: string[]): PromotionResult {
  return { accepted: false, errors, outcome: null, lapsed: [], stale: [], waiver: null };
}

// G1 — wire-format schema, hand-rolled like ingest (the function must be
// total over arbitrary JSON, including fixture inputs).
function schemaValid(input: unknown): input is PromotionInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  const i = input as Record<string, unknown>;
  if (typeof i.asOf !== "string" || !Array.isArray(i.spec)) return false;
  const t = i.transition as Record<string, unknown> | undefined;
  if (t === null || typeof t !== "object" || Array.isArray(t)) return false;
  if (
    typeof t.criterionId !== "string" ||
    typeof t.requestedAt !== "string" ||
    typeof t.requestedBy !== "string" ||
    !TRANSITIONS.has(t.to as string) ||
    !Array.isArray(t.acknowledgments)
  ) {
    return false;
  }
  for (const a of t.acknowledgments as unknown[]) {
    if (a === null || typeof a !== "object" || Array.isArray(a)) return false;
    const ack = a as Record<string, unknown>;
    if (
      typeof ack.implementer !== "string" ||
      (ack.decision !== "ack" && ack.decision !== "nak") ||
      typeof ack.at !== "string" ||
      typeof ack.criterionHash !== "string"
    ) {
      return false;
    }
  }
  for (const f of KNOWN_BUG_FIELDS) {
    // undefined ≡ absent: the wire format is JSON, where undefined does not
    // exist; a JS caller passing an explicit undefined must behave like the
    // round-tripped JSON (the totality fuzz caught this divergence).
    if (t[f] !== undefined && typeof t[f] !== "string") return false;
  }
  return true;
}

export function promote(rawInput: unknown): PromotionResult {
  // G1 — schema guard.
  if (!schemaValid(rawInput)) return fail(["E_SCHEMA"]);
  const input = rawInput;
  const { transition: t, asOf } = input;
  const spec = input.spec as SpecRecord[];

  // G2 — spec lint-validity guard: without it, "the target criterion" and
  // "the roster entry named X" are not well-defined (duplicate ids and
  // duplicate roster names slip JSON Schema).
  if (!lint(spec).valid) return fail(["E_SPEC_INVALID"]);

  // G3 — the target criterion must exist.
  const criterion = spec.find(
    (r): r is Criterion => r.record === "criterion" && r.id === t.criterionId,
  );
  if (!criterion) return fail(["E_UNKNOWN_CRITERION"]);

  const preamble = spec.find((r): r is Preamble => r.record === "preamble");
  const roster = preamble?.implementers ?? [];
  const rosterNames = new Set(roster.map((i) => i.name));
  const timeoutDays = preamble?.governance?.timeoutDays ?? 30;

  // The unique repo owner, or none (zero or multiple — multiple cannot
  // reach here: lint's E_MULTIPLE_OWNERS stops it at G2).
  const owners = roster.filter((i) => i.roles.includes("repo-owner"));
  const owner = owners.length === 1 ? owners[0].name : null;

  // Acknowledgment classification.
  const currentHash = recordHash(criterion);
  const valid = (a: Acknowledgment) => t.requestedAt <= a.at && a.at <= asOf;
  const isStale = (a: Acknowledgment) => valid(a) && a.criterionHash !== currentHash;

  // Effective decision per roster implementer: latest valid, non-stale ack
  // by at; ties broken by greatest array index.
  const effective = new Map<string, "ack" | "nak">();
  for (const name of rosterNames) {
    let best: Acknowledgment | undefined;
    for (const a of t.acknowledgments) {
      if (a.implementer !== name || !valid(a) || isStale(a)) continue;
      if (!best || a.at >= best.at) best = a; // >= : later index wins ties
    }
    if (best) effective.set(name, best.decision);
  }

  // Lapse arithmetic: timeoutDays × 86400 s on the UTC-normalized instant —
  // never calendar arithmetic (DST flips the boundary verdict otherwise).
  const deadline = Date.parse(t.requestedAt) + timeoutDays * 86400_000;
  const lapsedAt = Date.parse(asOf) > deadline;
  const lapsed = [...rosterNames].filter((n) => !effective.has(n) && lapsedAt).sort();

  // Stale list: roster implementers with >=1 valid stale ack and no
  // effective decision — ignored for decisions, loud here (D1 convention).
  const stale = [...rosterNames]
    .filter(
      (n) =>
        !effective.has(n) &&
        t.acknowledgments.some((a) => a.implementer === n && isStale(a)),
    )
    .sort();

  const errors = new Set<string>();

  if (criterion.state !== "proposed") errors.add("E_NOT_PROPOSED");
  if (t.requestedAt > asOf) errors.add("E_BAD_REQUEST");
  if (
    !rosterNames.has(t.requestedBy) ||
    t.acknowledgments.some((a) => !rosterNames.has(a.implementer))
  ) {
    errors.add("E_NOT_ROSTER");
  }
  if (t.acknowledgments.some((a) => !valid(a))) errors.add("E_BAD_ACK");
  if (t.to === "known-bug" && KNOWN_BUG_FIELDS.some((f) => t[f] === undefined)) {
    errors.add("E_MISSING_FIELD");
  }

  const ownerDecision = owner ? effective.get(owner) : undefined; // three-valued: ack | nak | none
  if (t.to === "active" || t.to === "known-bug") {
    if (
      ownerDecision === "nak" ||
      [...effective.entries()].some(
        ([n, d]) => d === "nak" && n !== owner && ownerDecision !== "ack",
      )
    ) {
      errors.add("E_VETOED");
    }
    if ([...rosterNames].some((n) => !effective.has(n) && !lapsed.includes(n))) {
      errors.add("E_PENDING");
    }
  } else {
    // rejected — deliberately lighter: one effective ack, no owner nak.
    if (ownerDecision === "nak") errors.add("E_VETOED");
    if (![...effective.values()].includes("ack")) errors.add("E_PENDING");
  }

  const sorted = [...errors].sort();
  const accepted = sorted.length === 0;
  const outcome = !accepted ? null : t.to === "rejected" ? "rejected" : "ratified";
  const waiver: Waiver | null =
    accepted && t.to === "known-bug"
      ? {
          criterionId: t.criterionId,
          implementation: t.implementation!,
          kind: "known-bug",
          justification: t.justification!,
          attribution: t.attribution!,
          expiresAt: t.expiresAt!,
        }
      : null;

  return { accepted, errors: sorted, outcome, lapsed, stale, waiver };
}
