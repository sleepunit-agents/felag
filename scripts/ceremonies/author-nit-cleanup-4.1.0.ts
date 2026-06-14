// Ceremony 7 (t-16): felag-core 4.1.0 — batch the accumulated cosmetic NITs
// from the 3.0.0/4.0.0 cold reviews. MINOR (ac-vers-minor-patch: "adds a new
// fixture to an existing criterion" is MINOR; the two text edits below are
// PATCH-class clarifications that complete enumerations the governing
// principles already implied — they change no conforming implementation's
// obligations, the MUST/PATCH line in it-versioning). Nothing here adds an
// active MUST, modifies/removes a fixture, or ratifies a proposed→active, so
// no MAJOR trigger fires.
//
// Edits (all via the library: serialize/sortFixtures/recordHash — never
// hand-formatted JSONL):
//   t-3  ac-gate-graduated   += fx-verdict-graduated-deprecated-vanish
//   t-4  ac-grad-admissibility += fx-grad-unverifiable-calibration
//   t-13c ac-gate-descriptive += fx-verdict-descriptive-failing-record
//   t-13a ac-vers-major (item text): enumerate the active→descriptive demotion
//   t-13b it-verification (D4 body): add `descriptive` to the non-gating list
//
// The three criteria that gain a fixture are active and carry governance
// triplets; adding a fixture changes their record hash, staling the acks.
// They stay active here — promote-nit-cleanup-4.1.0.ts re-ratifies them
// (regenerates the triplet with an ack bound to the new committed-as-proposed
// hash). Rerunnable: reads the committed 4.0.0 files.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, serialize, sortFixtures } from "../src/canonical.js";
import { lint } from "../src/lint.js";
import type { Criterion, Fixture, Item, Preamble, SpecRecord } from "../src/records.js";

const dir = join(import.meta.dirname, "..", "spec", "felag-core");
const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];

const preamble = spec[0] as Preamble;
if (preamble.conformanceVersion !== "4.0.0") {
  throw new Error(`expected committed 4.0.0 spec as input — found ${preamble.conformanceVersion}`);
}

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
function amend(target: { item?: string; body?: string }, key: "item" | "body", from: string, to: string) {
  const text = target[key];
  if (text === undefined || !text.includes(from)) {
    throw new Error(`amendment anchor not found in ${key}: ${from.slice(0, 70)}`);
  }
  if (text.includes(to.slice(0, 80)) && to.length > from.length) {
    // crude idempotence guard for the additive edits
  }
  target[key] = text.replace(from, to);
}

// ---------------------------------------------------------------------------
// 1. Preamble: MINOR bump.
// ---------------------------------------------------------------------------
preamble.conformanceVersion = "4.1.0";

// ---------------------------------------------------------------------------
// 2. t-13a — ac-vers-major: enumerate the active→descriptive demotion.
//    active→descriptive strips an active MUST from gating exactly as
//    active→deprecated does (it-gating: descriptive never gates). The 4.0.0
//    descriptive state was added without updating this enumeration, and the
//    demotion changes only the state field, not gherkin/item text, so the
//    catch-all "materially changes normative text" never caught it. Naming it
//    here completes the enumeration to match the principle the deprecate clause
//    already embodies. (Clarification, not a new obligation: versioning
//    criteria are advisory — no verb mechanically enforces a bump — so no
//    conforming implementation's obligations change. PATCH-class edit.)
// ---------------------------------------------------------------------------
amend(
  criterion("ac-vers-major"),
  "item",
  "deprecates an active MUST criterion, ratifies a proposed MUST criterion to active,",
  "deprecates an active MUST criterion, demotes an active MUST criterion to descriptive (it strips an active MUST from gating exactly as deprecation does), ratifies a proposed MUST criterion to active,",
);

// ---------------------------------------------------------------------------
// 3. t-13b — it-verification D4: add descriptive to the non-gating-state list.
//    Since 4.0.0 descriptive is a fourth state in which a graduatable criterion
//    does not gate; D4's parenthetical listed only proposed/deprecated/disputed.
//    A graduatable descriptive criterion's judgment evidence already does not
//    bear on the report (ac-gate-graduated: graduatable criteria never enter
//    advisory; ac-gate-descriptive: descriptive never gates), so this only
//    completes the enumeration. Clarification of body rule-text → PATCH-class.
// ---------------------------------------------------------------------------
amend(
  item("it-verification"),
  "body",
  "when they do not gate (proposed or deprecated state, or disputed for the disputer) their judgment evidence does not bear on this report at all",
  "when they do not gate (proposed, deprecated, or descriptive state, or disputed for the disputer) their judgment evidence does not bear on this report at all",
);

// ---------------------------------------------------------------------------
// 4. New fixtures. The three target criteria each gain exactly one fixture
//    (MINOR). recordHash is never hand-written; these fixtures reuse the
//    established felag-core playground (preamble g-spec / item it-x / anchors
//    anchor-pass+anchor-fail) verbatim so the precomputed anchor fixtureHashes
//    and the jc-1 judgmentHash carried on existing judgment fixtures stay
//    byte-identical.
// ---------------------------------------------------------------------------

// Shared playground records (identical bytes to the existing judgment corpus).
const gPreamble = {
  conformanceVersion: "1.0.0",
  contracts: [{ description: "playground contract", id: "c-x" }],
  exclusions: [],
  goals: [],
  implementers: [{ name: "impl-a", roles: ["author"] }],
  name: "g-spec",
  record: "preamble",
};
const gItem = { body: "Conduct under judgment.", id: "it-x", record: "item", title: "Reporting" };
const anchorFail = {
  description: "Anchor: a clearly violating artifact (known-correct verdict fail)",
  expected: { verdict: "fail" },
  format: "felag/judgment-anchor@0",
  id: "anchor-fail",
  input: { artifact: "ERR 0x5f3759df see trace" },
  record: "fixture",
};
const anchorPass = {
  description: "Anchor: a clearly satisfying artifact (known-correct verdict pass)",
  expected: { verdict: "pass" },
  format: "felag/judgment-anchor@0",
  id: "anchor-pass",
  input: { artifact: "The report names each failing criterion and states the remedy plainly." },
  record: "fixture",
};
// Precomputed hashes from the existing judgment corpus (fx-grad-proposed etc.).
const HASH_ANCHOR_FAIL = "sha256:defef94d655844805a700fe2c27f347031cbe65360691cf51b2245fd6da80dfe";
const HASH_ANCHOR_PASS = "sha256:e5fc75455b8dd5031f571b7c54d04c9ab04b389252f38c0ad35f453b4de2f0f3";
const HASH_JC1_PROJECTION = "sha256:b6963ee153a9582c31f589860e1ff510be8ae8f6de52a20df82b396de9ed3295";

function jc(over: Record<string, unknown>): Record<string, unknown> {
  return {
    class: "judgment",
    contractId: "c-x",
    fixtures: ["anchor-fail", "anchor-pass"],
    force: "MUST",
    id: "jc-1",
    item: "While reporting conformance, the implementation shall use clear, observable language.",
    itemId: "it-x",
    judgment: { rubric: "Is the report language clear, observable, and free of implementation jargon?", tolerance: { agreement: 1, runs: 1 } },
    record: "criterion",
    source: "forethought",
    state: "active",
    type: "checklist",
    ...over,
  };
}
function calib(fixtureId: string, fixtureHash: string, verdict: string, at: string): Record<string, unknown> {
  return {
    at,
    attribution: "fixture",
    criterionId: "jc-1",
    evidence: "calibration run",
    fixtureHash,
    fixtureId,
    judge: { model: "judge-a" },
    judgmentHash: HASH_JC1_PROJECTION,
    kind: "calibration",
    runner: "harness",
    verdict,
  };
}
function target(verdict: string, at: string): Record<string, unknown> {
  return {
    at,
    attribution: "fixture",
    conformanceVersion: "1.0.0",
    criterionId: "jc-1",
    evidence: "target run",
    implementation: "impl-a",
    judge: { model: "judge-a" },
    judgmentHash: HASH_JC1_PROJECTION,
    kind: "target",
    runner: "harness",
    verdict,
  };
}

const newFixtures: Fixture[] = [];

// --- t-4: ac-grad-admissibility — unverifiable CALIBRATION → inadmissible ---
// judge-a calibrates anchor-fail correctly (fail) but returns `unverifiable`
// on anchor-pass. The admissibility rule requires, for EVERY anchor, the
// judge's latest calibration verdict to EQUAL the anchor's expected (pass|fail);
// unverifiable equals neither, so judge-a fails anchor-pass and is inadmissible.
// Its target record therefore never qualifies → basis no-admissible-judge,
// judges lists judge-a as {admissible:false}, window empty. Mirrors the pinned
// target-side abstention (fx-grad-unverifiable-slot) on the calibration side.
newFixtures.push({
  record: "fixture",
  id: "fx-grad-unverifiable-calibration",
  contractId: "c-verification",
  description:
    "A judge whose latest calibration on the pass anchor is unverifiable (correct fail on the other) is INADMISSIBLE: the admissibility bar is verdict EQUAL to each anchor's expected pass|fail, and unverifiable equals neither - an abstention is not a correct calibration. Its target record never qualifies, so basis is no-admissible-judge with judge-a listed {admissible:false} and window empty. An implementation treating an unverifiable calibration as a pass-through (admissible) would wrongly admit the judge and could graduate; the target-side abstention is already pinned (fx-grad-unverifiable-slot), this pins the calibration side.",
  format: "felag/graduation-input@0",
  input: {
    criterionId: "jc-1",
    implementation: "impl-a",
    records: [
      calib("anchor-fail", HASH_ANCHOR_FAIL, "fail", "2026-05-01T00:00:00Z"),
      calib("anchor-pass", HASH_ANCHOR_PASS, "unverifiable", "2026-05-01T00:01:00Z"),
      target("pass", "2026-06-01T00:00:00Z"),
    ],
    spec: [gPreamble, gItem, jc({}), anchorFail, anchorPass],
  },
  expected: { basis: "no-admissible-judge", errors: [], graduated: false, judges: [{ admissible: false, judge: { model: "judge-a" } }], window: [] },
} as unknown as Fixture);

// --- t-3: ac-gate-graduated — proposed/deprecated graduatable vanishes from ---
// BOTH gating and advisory at the report level, even carrying full judgment
// evidence. A DEPRECATED graduatable MUST criterion with an admissible judge
// and a window that would reproducible-FAIL it does not gate (deprecated) and
// does not appear in advisory (graduatable, gating or not, never does) — its
// judgment evidence does not bear on the report at all (D4). Verdict conforms,
// failing and advisory empty. Discriminates two wrong impls at once: one that
// gates deprecated criteria (it would drift), one that surfaces graduatable
// judgment evidence in advisory (it would list jc-1). The existing
// fx-verdict-graduated-conforms only shows a proposed graduatable criterion
// with a bare VerificationRecord and no judgmentRecords — it never exercises
// D4's "judgment evidence does not bear."
newFixtures.push({
  record: "fixture",
  id: "fx-verdict-graduated-deprecated-vanish",
  contractId: "c-verification",
  description:
    "A DEPRECATED graduatable MUST criterion carrying full judgment evidence (admissible judge; window of reproducible fails that WOULD drift it if it gated) vanishes from the report: it does not gate (deprecated, ac-gate-nonactive) and never enters advisory (graduatable, ac-gate-graduated), so its judgment evidence does not bear on the report at all (D4). Beside a passing active behavioral criterion the verdict is conforms, failing and advisory empty. An implementation that gated deprecated criteria would drift; one that listed graduatable judgment evidence in advisory would surface jc-1. Pins the report-level vanish that fx-grad-proposed (a graduation-input, state-independence) does not.",
  format: "felag/verify-input@0",
  input: {
    asOf: "2026-06-10T00:00:00Z",
    implementation: "impl-a",
    judgmentRecords: [
      calib("anchor-fail", HASH_ANCHOR_FAIL, "fail", "2026-05-01T00:00:00Z"),
      calib("anchor-pass", HASH_ANCHOR_PASS, "pass", "2026-05-01T00:01:00Z"),
      target("fail", "2026-06-01T00:00:00Z"),
    ],
    records: [
      {
        at: "2026-06-01T00:00:00Z",
        attribution: "fixture",
        conformanceVersion: "1.0.0",
        criterionId: "ac-beh",
        evidence: "self-report",
        fixtureId: "fx-beh",
        implementation: "impl-a",
        implementationVersion: "1.0.0",
        runner: "harness",
        verdict: "pass",
      },
    ],
    spec: [
      gPreamble,
      gItem,
      // active behavioral criterion that passes — keeps the spec gating something.
      {
        class: "behavioral",
        contractId: "c-x",
        fixtures: ["fx-beh"],
        force: "MUST",
        gherkin: "Given x\nWhen y\nThen z",
        id: "ac-beh",
        itemId: "it-x",
        record: "criterion",
        source: "forethought",
        state: "active",
        type: "scenario",
      },
      // the deprecated graduatable criterion whose evidence must not bear.
      jc({ id: "jc-1", state: "deprecated" }),
      { description: "behavioral anchor", expected: { ok: true }, format: "json", id: "fx-beh", input: {}, record: "fixture", contractId: "c-x" },
      anchorFail,
      anchorPass,
    ],
    waivers: [],
  },
  expected: { advisory: [], conformanceVersion: "1.0.0", disputed: [], failing: [], implementation: "impl-a", verdict: "conforms", waived: [] },
} as unknown as Fixture);

// --- t-13c: ac-gate-descriptive — a descriptive criterion carrying a FAILING ---
// record still does not gate. Today only the no-record descriptive case is
// fixtured (fx-verdict-descriptive-ignored); this closes the wrong impl that
// gates a descriptive criterion the moment a (failing) record exists for it.
newFixtures.push({
  record: "fixture",
  id: "fx-verdict-descriptive-failing-record",
  contractId: "c-verification",
  description:
    "A descriptive MUST criterion carrying a FAILING VerificationRecord still does not gate: descriptive never gates regardless of record presence (it-gating), so beside a passing active criterion the verdict is conforms and the descriptive criterion appears in neither failing nor advisory. fx-verdict-descriptive-ignored pins the no-record case; this pins the with-failing-record case, killing the wrong impl that gates a descriptive criterion only once a record exists for it.",
  format: "felag/verify-input@0",
  input: {
    asOf: "2026-06-11T00:00:00Z",
    implementation: "impl-a",
    records: [
      {
        at: "2026-06-01T00:00:00Z",
        attribution: "fixture",
        conformanceVersion: "1.0.0",
        criterionId: "ac-active",
        evidence: "self-report",
        fixtureId: "fx-a",
        implementation: "impl-a",
        implementationVersion: "1.0.0",
        runner: "harness",
        verdict: "pass",
      },
      {
        at: "2026-06-01T00:00:00Z",
        attribution: "fixture",
        conformanceVersion: "1.0.0",
        criterionId: "ac-desc",
        evidence: "self-report",
        fixtureId: "fx-d",
        implementation: "impl-a",
        implementationVersion: "1.0.0",
        runner: "harness",
        verdict: "fail",
      },
    ],
    spec: [
      gPreamble,
      gItem,
      {
        class: "behavioral",
        contractId: "c-x",
        fixtures: ["fx-a"],
        force: "MUST",
        gherkin: "Given x\nWhen y\nThen z",
        id: "ac-active",
        itemId: "it-x",
        record: "criterion",
        source: "forethought",
        state: "active",
        type: "scenario",
      },
      {
        class: "behavioral",
        contractId: "c-x",
        fixtures: ["fx-d"],
        force: "MUST",
        gherkin: "Given x\nWhen y\nThen z",
        id: "ac-desc",
        itemId: "it-x",
        record: "criterion",
        source: "forethought",
        state: "descriptive",
        type: "scenario",
      },
      { description: "active anchor", expected: { ok: true }, format: "json", id: "fx-a", input: {}, record: "fixture", contractId: "c-x" },
      { description: "descriptive anchor", expected: { ok: true }, format: "json", id: "fx-d", input: {}, record: "fixture", contractId: "c-x" },
    ],
    waivers: [],
  },
  expected: { advisory: [], conformanceVersion: "1.0.0", disputed: [], failing: [], implementation: "impl-a", verdict: "conforms", waived: [] },
} as unknown as Fixture);

// ---------------------------------------------------------------------------
// 5. Attach fixtures to their criteria (append, preserving narrative order).
// ---------------------------------------------------------------------------
function attach(critId: string, fxId: string) {
  const c = criterion(critId);
  if (!c.fixtures.includes(fxId)) c.fixtures = [...c.fixtures, fxId];
}
attach("ac-grad-admissibility", "fx-grad-unverifiable-calibration");
attach("ac-gate-graduated", "fx-verdict-graduated-deprecated-vanish");
attach("ac-gate-descriptive", "fx-verdict-descriptive-failing-record");

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

writeFileSync(join(dir, "spec.jsonl"), serialize(spec));
writeFileSync(join(dir, "fixtures.jsonl"), serialize(allFixtures));
console.log(`spec.jsonl: ${spec.length} records; fixtures.jsonl: ${allFixtures.length} records (${newFixtures.length} new)`);
console.log("lint: valid");
