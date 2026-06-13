// felag status is presentation (excluded surface — no contract), so this is
// a smoke test, not conformance: the projection's invariants hold and the
// HTML renders. The load-bearing invariant: visible rows == summary counts
// (a contract-less criterion must not vanish — the bug felag-core caught).

import { describe, expect, it } from "vitest";
import { computeStatus, renderStatusHTML } from "../src/status.js";
import type { SpecRecord, VerificationRecord } from "../src/records.js";

const spec: SpecRecord[] = [
  {
    record: "preamble", name: "mini", conformanceVersion: "1.0.0",
    goals: [], exclusions: [], governance: { timeoutDays: 30 },
    contracts: [{ id: "c1", description: "mini contract" }],
    implementers: [{ name: "impl-a", roles: ["repo-owner"] }],
  } as SpecRecord,
  { record: "item", id: "it1", title: "I", body: "b" } as SpecRecord,
  { record: "criterion", id: "ac1", itemId: "it1", type: "scenario", class: "behavioral", gherkin: "Given x\nWhen y\nThen z", force: "MUST", state: "active", source: "forethought", contractId: "c1", fixtures: ["fx1"] } as SpecRecord,
  { record: "criterion", id: "ac2", itemId: "it1", type: "scenario", class: "behavioral", gherkin: "Given p\nThen q", force: "MUST", state: "proposed", source: "forethought", contractId: "c1", fixtures: ["fx1"] } as SpecRecord,
  { record: "criterion", id: "ac3", itemId: "it1", type: "checklist", class: "judgment", force: "MUST", state: "active", source: "forethought", fixtures: [] } as SpecRecord,
  { record: "fixture", id: "fx1", contractId: "c1", description: "f", format: "json", input: {}, expected: {} } as SpecRecord,
];

const passing: VerificationRecord[] = [{
  criterionId: "ac1", fixtureId: "fx1", implementation: "impl-a", implementationVersion: "1.0.0",
  conformanceVersion: "1.0.0", verdict: "pass", evidence: "e", runner: "r",
  at: "2026-06-13T00:00:00Z", attribution: "a",
}];

describe("felag status projection", () => {
  it("visible rows equal summary counts (no criterion vanishes)", () => {
    const m = computeStatus(spec, { records: passing, implementation: "impl-a" });
    const rows = m.contracts.reduce((n, c) => n + c.criteria.length, 0);
    const counted = Object.values(m.counts).reduce((a, b) => a + b, 0);
    expect(rows).toBe(counted);
    expect(rows).toBe(3);
  });

  it("a contract-less criterion lands in the (no contract) section", () => {
    const m = computeStatus(spec, { records: passing, implementation: "impl-a" });
    const orphan = m.contracts.find((c) => c.id === "(no contract)");
    expect(orphan?.criteria.map((c) => c.id)).toEqual(["ac3"]);
  });

  it("derives conforming / proposed from spec-state joined with verify", () => {
    const m = computeStatus(spec, { records: passing, implementation: "impl-a" });
    expect(m.counts.conforming).toBe(2); // ac1 (passing) + ac3 (active, ungated)
    expect(m.counts.proposed).toBe(1); // ac2
    expect(m.verdict).toBe("conforms");
  });

  it("without records, active criteria are unverified", () => {
    const m = computeStatus(spec, {});
    expect(m.counts.unverified).toBe(2); // ac1, ac3
    expect(m.verdict).toBe("unverified");
  });

  it("criterion scope returns a populated detail", () => {
    const m = computeStatus(spec, { records: passing, implementation: "impl-a", target: "ac1" });
    expect(m.scope.kind).toBe("criterion");
    expect(m.criterion?.id).toBe("ac1");
    expect(m.criterion?.status).toBe("conforming");
  });

  it("renders a self-contained HTML document", () => {
    const html = renderStatusHTML(computeStatus(spec, { records: passing, implementation: "impl-a" }));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("mini");
  });
});
