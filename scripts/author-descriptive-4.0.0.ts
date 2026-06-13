// Ceremony 5 (t-6): author felag-core 4.0.0 — the descriptive criterion state.
//
// excavate (ceremony 4) legitimately produced criteria recorded as TRUE but
// deliberately NOT law (loom's soft category boundaries, embedding rank
// quality). They were left `proposed`, which conflated "awaiting ratification"
// with "intentionally descriptive forever" — a reader could not tell a
// candidate for active from a deliberate non-law. 4.0.0 adds a fifth, terminal
// criterion state `descriptive`: recorded true, never gates, renders marked
// non-normative, NOT a promotion target. It is reached by an ordinary committed
// edit (proposed and descriptive are both inert, so re-designation changes no
// obligations and is not a ratification event — it-versioning), so promotion
// stays the gating-obligation state machine and `active` remains reachable only
// by ratifying a proposed criterion.
//
// Builds the amended spec.jsonl and fixtures.jsonl through the library
// (serialize/sortFixtures, recordHash — never hand-formatted), validates with
// lint and validateAuthorOutput, writes canonical interchange. Rerunnable:
// reads the committed 3.0.0 files. The new criterion lands `proposed`;
// ratification is the promotion protocol's (promote-descriptive-4.0.0.ts).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, serialize, sortFixtures, recordHash } from "../src/canonical.js";
import { lint } from "../src/lint.js";
import { validateAuthorOutput } from "../src/author.js";
import type { Criterion, Fixture, Item, Preamble, SpecRecord } from "../src/records.js";

const dir = join(import.meta.dirname, "..", "spec", "felag-core");
const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];

if ((spec[0] as Preamble).conformanceVersion !== "3.0.0") {
  throw new Error("expected the committed 3.0.0 spec as input — already amended?");
}

// ---------------------------------------------------------------------------
// 1. Preamble: version bump (MAJOR — ac-vers-major fires twice: the it-gating
//    body's state enumeration is normative text materially changed, and a
//    proposed MUST criterion is ratified to active this ceremony).
// ---------------------------------------------------------------------------

const preamble = spec[0] as Preamble;
preamble.conformanceVersion = "4.0.0";

// ---------------------------------------------------------------------------
// 2. it-gating body: add descriptive to the States enumeration and the
//    lifecycle rationale (the resting place for honest archaeology).
// ---------------------------------------------------------------------------

function item(id: string): Item {
  const it = spec.find((r) => r.record === "item" && r.id === id) as Item | undefined;
  if (!it) throw new Error(`item ${id} not found`);
  return it;
}
function criterion(id: string): Criterion {
  const c = spec.find((r) => r.record === "criterion" && r.id === id) as Criterion | undefined;
  if (!c) throw new Error(`criterion ${id} not found`);
  return c;
}
function amend(target: { body?: string }, from: string, to: string) {
  const text = target.body;
  if (text === undefined || !text.includes(from)) {
    throw new Error(`amendment anchor not found: ${from.slice(0, 60)}`);
  }
  target.body = text.replace(from, to);
}

const gating = item("it-gating");
// Extend the States enumeration sentence.
amend(
  gating,
  "disputed (gates everyone except the disputing implementer; reported loudly everywhere). A disputed criterion carries dispute",
  "disputed (gates everyone except the disputing implementer; reported loudly everywhere), and descriptive (recorded as true but deliberately not law: it never gates, renders marked non-normative wherever a non-active state is, and is terminal). A disputed criterion carries dispute",
);
// Append the lifecycle rationale paragraph after the dispute-attribution sentence.
amend(
  gating,
  "'by' is the implementer roster name whose reports stop gating on it (derived: the design names no schema home for dispute attribution).",
  "'by' is the implementer roster name whose reports stop gating on it (derived: the design names no schema home for dispute attribution).\n\nThe descriptive state (4.0.0) is the resting place for an observation that documents without legislating - honest archaeology (excavate) and known-but-ungated truths (authoring) both legitimately produce criteria that record how a system behaves while deliberately declining to make that behavior a MUST. Before 4.0.0 proposed carried both meanings - a candidate awaiting ratification AND a deliberate non-law - and a reader could not tell them apart; descriptive separates them. It never gates (it-gating's conjunction admits only active or disputed), it renders (non-deprecated, so every audience sees it; stakeholder marks it loudly as a non-active state, the render-side analog of refusing to assert bare conformance), and it is terminal: active is reachable only by ratifying a proposed criterion through the promotion protocol, never from descriptive, so promotion refuses a descriptive target exactly as it refuses any non-proposed one (E_NOT_PROPOSED). descriptive is reached by an ordinary committed edit, NOT a promotion transition - proposed and descriptive are both inert, gating no one, so re-designating one as the other changes no implementer's obligations and is not a ratification event (it-versioning); to revive a descriptive criterion as law an ordinary edit returns it to proposed and promotion ratifies it. State is orthogonal to source: a descriptive criterion may be discovered (excavate output, later designated) or forethought (authored as a known non-law). Excavate itself still emits only proposed (it-author-excavate X2) - it surfaces candidates, and designating one descriptive is a deliberate maintainer edit, never archaeology minting a terminal record.",
);

// ---------------------------------------------------------------------------
// 3. New criterion (proposed; ratified through the promotion protocol).
//    ac-gate-descriptive is the descriptive state's authority: it pins the
//    load-bearing new law (never gates) on c-verification, and carries the
//    schema-validity fixtures (descriptive across both provenances is lint-
//    valid; the enum stays closed). Adding descriptive to the state enum is
//    not a new lint RULE — it is the existing schema-validity mechanism over an
//    extended enum — so it warrants no new it-lint criterion (which sits at the
//    7-criteria budget by design), the same way none of the other four states
//    carries a positive lint criterion of its own.
// ---------------------------------------------------------------------------

const acGateDescriptive: Criterion = {
  record: "criterion",
  id: "ac-gate-descriptive",
  itemId: "it-gating",
  contractId: "c-verification",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "proposed",
  source: "forethought",
  gherkin:
    "Given a spec carrying two descriptive MUST criteria - one source discovered with its provenance triplet, one source forethought - alongside a passing active criterion, none of the descriptive criteria carrying any record\nWhen verify derives conformance\nThen no descriptive criterion gates and the verdict is conforms, exactly as proposed and deprecated never gate (ac-gate-nonactive)\nAnd lint accepts both descriptive criteria - the descriptive state is orthogonal to source - while a criterion whose state is outside the lifecycle enum is rejected with E_SCHEMA naming it",
  fixtures: ["fx-lint-descriptive-valid", "fx-lint-unknown-state", "fx-verdict-descriptive-ignored"],
};

// Splice ac-gate-descriptive at the end of it-gating's cluster (CS7 ordering).
function lastIndexOfCluster(itemId: string): number {
  let last = -1;
  spec.forEach((r, i) => {
    if ((r.record === "item" && r.id === itemId) || (r.record === "criterion" && (r as Criterion).itemId === itemId)) {
      last = i;
    }
  });
  if (last === -1) throw new Error(`cluster ${itemId} not found`);
  return last;
}
spec.splice(lastIndexOfCluster("it-gating") + 1, 0, acGateDescriptive);

// ---------------------------------------------------------------------------
// 4. The render and promotion facets ride on existing (proposed, author-class)
//    criteria whose gherkins already cover the general behavior — non-deprecated
//    criteria render (ac-render-stakeholder), a non-proposed target is refused
//    (ac-promo-ratify). We add the descriptive case as a new fixture on each;
//    adding a fixture to a proposed criterion is MINOR and leaves it proposed.
// ---------------------------------------------------------------------------

// Append (preserving each criterion's established fixture order) rather than
// re-sort — the spec orders fixture lists narratively, not alphabetically.
const render = criterion("ac-render-stakeholder");
if (!render.fixtures.includes("fx-render-descriptive-stakeholder")) {
  render.fixtures = [...render.fixtures, "fx-render-descriptive-stakeholder"];
}
const promoRatify = criterion("ac-promo-ratify");
if (!promoRatify.fixtures.includes("fx-promo-descriptive-not-proposed")) {
  promoRatify.fixtures = [...promoRatify.fixtures, "fx-promo-descriptive-not-proposed"];
}

// ---------------------------------------------------------------------------
// 5. Fixtures. Shared mini-spec playground; the descriptive criteria carry both
//    provenances. recordHash computed, never hand-written.
// ---------------------------------------------------------------------------

const miniPreamble: Preamble = {
  record: "preamble",
  name: "mini",
  conformanceVersion: "1.0.0",
  goals: ["exercise the felag-core fixtures"],
  contracts: [{ id: "c1", description: "mini contract" }],
  exclusions: [],
  implementers: [{ name: "impl-a", roles: ["repo-owner"] }],
};
const miniItem: Item = { record: "item", id: "it1", title: "mini item", body: "mini body" };
const miniFixture: Fixture = {
  record: "fixture",
  id: "fx1",
  contractId: "c1",
  description: "mini fixture",
  format: "json",
  input: { x: 1 },
  expected: { y: 2 },
};

function crit(over: Partial<Criterion> & { id: string }): Criterion {
  return {
    record: "criterion",
    itemId: "it1",
    contractId: "c1",
    type: "scenario",
    class: "behavioral",
    force: "MUST",
    state: "proposed",
    source: "forethought",
    fixtures: ["fx1"],
    gherkin: "Given x\nWhen y\nThen z",
    ...over,
  } as Criterion;
}

const activePass = crit({ id: "ac1", state: "active" });
const descDiscovered = crit({
  id: "ac-desc-d",
  state: "descriptive",
  source: "discovered",
  discoveredAt: "2026-06-10T00:00:00Z",
  discoveredBy: "excavate run:7",
  triggeringEvent: "brownfield excavation",
} as Partial<Criterion> & { id: string });
const descForethought = crit({ id: "ac-desc-f", state: "descriptive" });

const newFixtures: Fixture[] = [];
function fx(id: string, description: string, format: string, input: unknown, expected: unknown, contractId: string) {
  newFixtures.push({ record: "fixture", id, contractId, description, format, input, expected });
}

// --- verify: descriptive never gates (ac-gate-descriptive) ---
fx(
  "fx-verdict-descriptive-ignored",
  "Two descriptive MUST criteria (one discovered, one forethought) with no records, beside a passing active criterion: descriptive never gates - verdict conforms. An implementation treating descriptive as gating would fail both and drift; one treating it as advisory would still conform. State is orthogonal to source.",
  "felag/verify-input@0",
  {
    asOf: "2026-06-11T00:00:00Z",
    implementation: "impl-a",
    records: [
      {
        at: "2026-06-11T00:00:00Z",
        attribution: "ci@example run:1",
        conformanceVersion: "1.0.0",
        criterionId: "ac1",
        evidence: "runner output ref #1",
        fixtureId: "fx1",
        implementation: "impl-a",
        implementationVersion: "1.0.0",
        runner: "ci",
        verdict: "pass",
      },
    ],
    spec: [miniPreamble, miniItem, activePass, descDiscovered, descForethought, miniFixture],
    waivers: [],
  },
  { advisory: [], conformanceVersion: "1.0.0", disputed: [], failing: [], implementation: "impl-a", verdict: "conforms", waived: [] },
  "c-verification",
);

// --- lint: descriptive is schema-valid across provenances (ac-gate-descriptive) ---
fx(
  "fx-lint-descriptive-valid",
  "A spec carrying descriptive criteria of source discovered and of source forethought is lint-valid: the descriptive state is a recognized lifecycle state, orthogonal to source. An implementation that added the state to its records type but not to lint's accepted set would reject this with E_SCHEMA - the drift this fixture guards.",
  "felag/lint-input@0",
  { spec: [miniPreamble, miniItem, activePass, descDiscovered, descForethought, miniFixture] },
  { valid: true, errors: [] },
  "c-interchange",
);
fx(
  "fx-lint-unknown-state",
  "A criterion whose state is outside the lifecycle enum (here 'observed', a tempting alternative name for descriptive) is rejected with E_SCHEMA naming it: the state enum stays closed - descriptive is the one new value, not an open door.",
  "felag/lint-input@0",
  { spec: [miniPreamble, miniItem, crit({ id: "ac-bogus", state: "observed" as Criterion["state"] }), miniFixture] },
  { valid: false, errors: [{ code: "E_SCHEMA", ref: "ac-bogus" }] },
  "c-interchange",
);

// --- render: a descriptive criterion is included and marked (ac-render-stakeholder) ---
{
  const included = [miniItem.id, activePass.id, "ac-desc"].sort();
  fx(
    "fx-render-descriptive-stakeholder",
    "Stakeholder render of a spec with active, descriptive, and deprecated criteria: the descriptive criterion is INCLUDED (non-deprecated, so stakeholders see it - marked by its retained state field), the deprecated one excluded. excludedFields is the unchanged eleven-field machine-plumbing list; state is retained so a non-active criterion is never rendered as if ratified.",
    "felag/render-inventory@0",
    {
      audience: "stakeholder",
      spec: [
        miniPreamble,
        miniItem,
        activePass,
        crit({ id: "ac-desc", state: "descriptive" }),
        crit({ id: "ac-dep", state: "deprecated" }),
        miniFixture,
      ],
    },
    {
      excludedFields: [
        "class",
        "contractId",
        "discoveredAt",
        "discoveredBy",
        "fixtures",
        "interfaceSketch",
        "itemId",
        "judgment",
        "source",
        "triggeringEvent",
        "type",
      ],
      included,
    },
    "c-author",
  );
}

// --- promotion: descriptive is terminal — refused as a target (ac-promo-ratify) ---
{
  const target = crit({ id: "ac1", state: "descriptive" });
  fx(
    "fx-promo-descriptive-not-proposed",
    "A promotion transition targeting a descriptive criterion is refused with E_NOT_PROPOSED, exactly as any non-proposed target is: descriptive is terminal. active is reachable only by an ordinary edit back to proposed followed by ratification - promotion never activates a descriptive criterion directly.",
    "felag/promotion-input@0",
    {
      asOf: "2026-06-12T00:00:00Z",
      spec: [miniPreamble, miniItem, target, miniFixture],
      transition: {
        criterionId: "ac1",
        to: "active",
        requestedAt: "2026-06-01T00:00:00Z",
        requestedBy: "impl-a",
        acknowledgments: [
          { implementer: "impl-a", decision: "ack", at: "2026-06-10T00:00:00Z", criterionHash: recordHash(target) },
        ],
      },
    },
    { accepted: false, errors: ["E_NOT_PROPOSED"], lapsed: [], outcome: null, stale: [], waiver: null },
    "c-author",
  );
}

// ---------------------------------------------------------------------------
// 6. Validate and write.
// ---------------------------------------------------------------------------

const allFixtures = sortFixtures([...fixtures, ...newFixtures]);
const all: SpecRecord[] = [...spec, ...allFixtures];

const lintResult = lint(all);
if (!lintResult.valid) {
  console.error(JSON.stringify(lintResult, null, 2));
  throw new Error("lint failed");
}
const authorResult = validateAuthorOutput({ spec: all, new: ["ac-gate-descriptive"] });
if (!authorResult.valid) {
  console.error(JSON.stringify(authorResult, null, 2));
  throw new Error("validateAuthorOutput failed");
}

writeFileSync(join(dir, "spec.jsonl"), serialize(spec));
writeFileSync(join(dir, "fixtures.jsonl"), serialize(allFixtures));
console.log(`spec.jsonl: ${spec.length} records; fixtures.jsonl: ${allFixtures.length} records (${newFixtures.length} new)`);
console.log("validateAuthorOutput: valid; lint: valid");
