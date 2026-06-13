// Pre-review addendum: THE RULE says the round you write the sentence is the
// round you write the fixture. Two D1J/it-gating sentences written this round
// lacked fixtures: the fail-closed poisoning rule (a judgment record
// ingestJudgment rejects fails every graduation at G1 through verify) and
// disputed-state gating for graduatable judgment criteria.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, serialize, sortFixtures, recordHash } from "../src/canonical.js";
import { lint } from "../src/lint.js";
import type { Criterion, Fixture, Item, JudgmentRecord, Preamble, SpecRecord, Tolerance } from "../src/records.js";

const dir = join(import.meta.dirname, "..", "spec", "felag-core");
const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];

if (fixtures.some((f) => f.id === "fx-verdict-judgment-poisoned")) throw new Error("already applied");

// Shared playground (mirrors the authored fixtures).
const gPreamble: Preamble = {
  record: "preamble",
  name: "g-spec",
  conformanceVersion: "1.0.0",
  goals: [],
  contracts: [{ id: "c-x", description: "playground contract" }],
  exclusions: [],
  implementers: [{ name: "impl-a", roles: ["author"] }],
};
const gItem: Item = { record: "item", id: "it-x", title: "Reporting", body: "Conduct under judgment." };
const anchorPass = fixtures.find((f) => f.id === "fx-grad-satisfied")!; // template source
const inputOf = (fx: Fixture) => fx.input as { spec: SpecRecord[] };
// Recover the canonical anchors from the committed satisfied fixture.
const satisfiedSpec = (anchorPass.input as { spec: SpecRecord[] }).spec;
const aPass = satisfiedSpec.find((r) => r.record === "fixture" && r.id === "anchor-pass") as Fixture;
const aFail = satisfiedSpec.find((r) => r.record === "fixture" && r.id === "anchor-fail") as Fixture;
void inputOf;

function gCriterion(tolerance: Tolerance | undefined, over: Partial<Criterion> = {}): Criterion {
  return {
    record: "criterion",
    id: "jc-1",
    itemId: "it-x",
    contractId: "c-x",
    type: "checklist",
    class: "judgment",
    item: "While reporting conformance, the implementation shall use clear, observable language.",
    force: "MUST",
    state: "active",
    source: "forethought",
    fixtures: ["anchor-fail", "anchor-pass"],
    judgment: {
      rubric: "Is the report language clear, observable, and free of implementation jargon?",
      ...(tolerance ? { tolerance } : {}),
    },
    ...over,
  };
}
function cal(c: Criterion, anchor: Fixture, model: string, verdict: string, at: string): JudgmentRecord {
  return {
    criterionId: c.id,
    criterionHash: recordHash(c),
    kind: "calibration",
    fixtureId: anchor.id,
    fixtureHash: recordHash(anchor),
    judge: { model },
    verdict: verdict as JudgmentRecord["verdict"],
    evidence: "calibration run",
    runner: "harness",
    at,
    attribution: "fixture",
  };
}
function tgt(c: Criterion, model: string, verdict: string, at: string, over: Partial<JudgmentRecord> = {}): JudgmentRecord {
  return {
    criterionId: c.id,
    criterionHash: recordHash(c),
    kind: "target",
    implementation: "impl-a",
    conformanceVersion: "1.0.0",
    judge: { model },
    verdict: verdict as JudgmentRecord["verdict"],
    evidence: "target run",
    runner: "harness",
    at,
    attribution: "fixture",
    ...over,
  };
}

const T1: Tolerance = { runs: 1, agreement: 1 };
const newFixtures: Fixture[] = [];

// 1. Poisoning: a record ingestJudgment rejects (malformed criterionHash)
// rides alongside evidence that would otherwise graduate; G1 fails the whole
// input through D1J — drifts. A filter-and-proceed implementation conforms.
{
  const c = gCriterion(T1);
  const good = [cal(c, aFail, "judge-a", "fail", "2026-05-01T00:00:00Z"), cal(c, aPass, "judge-a", "pass", "2026-05-01T00:01:00Z"), tgt(c, "judge-a", "pass", "2026-06-01T00:00:00Z")];
  const poisoned = tgt(c, "judge-a", "pass", "2026-06-02T00:00:00Z", { criterionHash: "sha256:not-a-hash" });
  newFixtures.push({
    record: "fixture",
    id: "fx-verdict-judgment-poisoned",
    contractId: "c-verification",
    description:
      "Evidence that would graduate the criterion plus one record ingestJudgment rejects (malformed criterionHash): G1 fails the whole input through D1J - not graduated, drifts, fail closed. Filtering the bad record out and proceeding wrongly conforms.",
    format: "felag/verify-input@0",
    input: {
      asOf: "2026-06-10T00:00:00Z",
      implementation: "impl-a",
      records: [],
      judgmentRecords: [...good, poisoned],
      spec: [gPreamble, gItem, c, aFail, aPass],
      waivers: [],
    },
    expected: { advisory: [], conformanceVersion: "1.0.0", disputed: [], failing: ["jc-1"], implementation: "impl-a", verdict: "drifts", waived: [] },
  });
}

// 2 + 3. Disputed graduatable criterion: gates everyone except the disputer.
{
  const c = gCriterion(T1, {
    state: "disputed",
    dispute: { by: "impl-a", reason: "rubric scope disputed", at: "2026-06-05T00:00:00Z" },
  });
  const specArr: SpecRecord[] = [gPreamble, gItem, c, aFail, aPass];
  newFixtures.push({
    record: "fixture",
    id: "fx-verdict-graduated-disputed-disputer",
    contractId: "c-verification",
    description:
      "A disputed graduatable judgment criterion does not gate the disputer: with no judgment evidence at all the disputer still conforms, the dispute listed loudly.",
    format: "felag/verify-input@0",
    input: { asOf: "2026-06-10T00:00:00Z", implementation: "impl-a", records: [], judgmentRecords: [], spec: specArr, waivers: [] },
    expected: { advisory: [], conformanceVersion: "1.0.0", disputed: ["jc-1"], failing: [], implementation: "impl-a", verdict: "conforms", waived: [] },
  });
  newFixtures.push({
    record: "fixture",
    id: "fx-verdict-graduated-disputed-other",
    contractId: "c-verification",
    description:
      "The same disputed graduatable criterion gates every other implementer: impl-b with no judgment evidence drifts at it, the dispute listed loudly.",
    format: "felag/verify-input@0",
    input: { asOf: "2026-06-10T00:00:00Z", implementation: "impl-b", records: [], judgmentRecords: [], spec: specArr, waivers: [] },
    expected: { advisory: [], conformanceVersion: "1.0.0", disputed: ["jc-1"], failing: ["jc-1"], implementation: "impl-b", verdict: "drifts", waived: [] },
  });
}

// Reference from ac-gate-graduated; extend its gherkin with the two clauses.
const acGate = spec.find((r) => r.record === "criterion" && r.id === "ac-gate-graduated") as Criterion;
acGate.fixtures = [
  "fx-verdict-graduated-conforms",
  "fx-verdict-graduated-disputed-disputer",
  "fx-verdict-graduated-disputed-other",
  "fx-verdict-graduated-drifts",
  "fx-verdict-graduated-insufficient",
  "fx-verdict-graduated-waived",
  "fx-verdict-judgment-poisoned",
];
acGate.gherkin =
  acGate.gherkin +
  "\nAnd a judgment record rejected by ingestJudgment anywhere in the verify input fails every graduation at G1 - not graduated, fail closed\nAnd a disputed graduatable criterion gates everyone except the disputer, the dispute listed loudly";

const allFixtures = sortFixtures([...fixtures, ...newFixtures]);
const all: SpecRecord[] = [...spec, ...allFixtures];
const res = lint(all);
if (!res.valid) {
  console.error(JSON.stringify(res, null, 2));
  throw new Error("lint failed");
}
writeFileSync(join(dir, "spec.jsonl"), serialize(spec));
writeFileSync(join(dir, "fixtures.jsonl"), serialize(allFixtures));
console.log(`fixtures.jsonl: ${allFixtures.length} records (+${newFixtures.length}); ac-gate-graduated now ${acGate.fixtures.length} fixtures`);
