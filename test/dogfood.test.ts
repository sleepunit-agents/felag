// The dogfood enablement surface: prime (the protocol brief emitter) and
// audit (coverage → idempotent task proposals through the felag-tasks
// contract). Plus the loop test: audit felag-core itself.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/canonical.js";
import { audit } from "../src/audit.js";
import { emitPrime } from "../src/prime.js";
import { validatePrimeOutput } from "../src/author.js";
import { TaskStore } from "../src/tasks/store.js";
import type { SpecRecord, VerifyInput } from "../src/records.js";

const dir = join(__dirname, "..", "spec", "felag-core");
const coreSpec: SpecRecord[] = [
  ...parse(readFileSync(join(dir, "spec.jsonl"), "utf8")),
  ...parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")),
];

describe("prime", () => {
  it("emits a brief over felag-core that passes its own validator", () => {
    const doc = emitPrime(coreSpec);
    expect(validatePrimeOutput({ spec: coreSpec, output: doc })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("covers every protocol item exactly (the five it-author-* items, not it-governance)", () => {
    const doc = emitPrime(coreSpec);
    for (const id of [
      "it-author-interview",
      "it-author-excavate",
      "it-author-render",
      "it-author-promotion",
      "it-author-prime",
    ]) {
      expect(doc).toContain(`\`${id}\``);
    }
    // it-governance carries only a contract-less judgment criterion: not a
    // protocol item, deliberately (design round 4).
    expect(doc).not.toContain("`it-governance`");
  });
});

const miniSpec: SpecRecord[] = [
  {
    record: "preamble",
    name: "mini",
    conformanceVersion: "1.0.0",
    goals: [],
    contracts: [{ id: "c1", description: "mini contract" }],
    exclusions: [],
    implementers: [{ name: "mini project", roles: ["repo-owner"] }],
  } as SpecRecord,
  { record: "item", id: "it1", body: "mini body", title: "mini item" } as SpecRecord,
  {
    record: "criterion",
    id: "ac1",
    itemId: "it1",
    type: "scenario",
    class: "behavioral",
    gherkin: "Given x\nWhen y\nThen z",
    force: "MUST",
    state: "active",
    source: "forethought",
    contractId: "c1",
    fixtures: ["fx1"],
  } as SpecRecord,
  {
    record: "fixture",
    id: "fx1",
    contractId: "c1",
    description: "mini fixture",
    format: "json",
    input: { x: 1 },
    expected: { y: 2 },
  } as SpecRecord,
];

const failingInput: VerifyInput = {
  asOf: "2026-06-12T00:00:00Z",
  implementation: "impl-a",
  records: [],
  spec: miniSpec,
  waivers: [],
};

describe("audit", () => {
  it("proposes one task per failing criterion, as a report artifact with no layer", () => {
    const result = audit(failingInput);
    expect(result.report.verdict).toBe("drifts");
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      specItemRef: "mini#it1",
      criterionId: "ac1",
      attribution: "felag-audit",
      at: "2026-06-12T00:00:00Z",
    });
    expect(result.results).toBeUndefined();
  });

  it("is idempotent through the work layer: re-running audit never duplicates", () => {
    const store = new TaskStore();
    const first = audit(failingInput, store);
    expect(first.results).toHaveLength(1);
    expect(first.results![0]).toMatchObject({ accepted: true, created: true });

    const second = audit(failingInput, store);
    expect(second.results![0]).toMatchObject({ accepted: true, created: false });
    expect(second.results![0].taskRef).toBe(first.results![0].taskRef);
    expect(store.report().entries).toHaveLength(1);
  });

  it("proposes nothing for a conforming implementation", () => {
    const input: VerifyInput = {
      ...failingInput,
      records: [
        {
          at: "2026-06-11T00:00:00Z",
          attribution: "ci run:1",
          conformanceVersion: "1.0.0",
          criterionId: "ac1",
          evidence: "runner output",
          fixtureId: "fx1",
          implementation: "impl-a",
          implementationVersion: "1.0.0",
          runner: "ci",
          verdict: "pass",
        },
      ],
    };
    const result = audit(input, new TaskStore());
    expect(result.report.verdict).toBe("conforms");
    expect(result.proposals).toHaveLength(0);
    expect(result.results).toHaveLength(0);
  });

  it("closes the loop on felag-core itself: felag-ts conforms, so audit proposes no work", () => {
    const records = readFileSync(join(dir, "..", "..", "verification", "felag-ts.records.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const result = audit(
      {
        asOf: "2026-06-12T23:59:59Z",
        implementation: "felag-ts",
        records,
        spec: coreSpec,
        waivers: [],
      },
      new TaskStore(),
    );
    expect(result.report.verdict).toBe("conforms");
    expect(result.proposals).toHaveLength(0);
  });
});
