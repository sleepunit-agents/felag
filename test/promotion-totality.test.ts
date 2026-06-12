// Totality regression: promote() claims to be total over its input space —
// every input, however adversarial, gets exactly one well-formed result and
// never a throw. The fixture corpus pins known corners; this fuzz pass walks
// thousands of structurally-warped inputs looking for the unknown ones.
// Seeded LCG: failures reproduce.

import { describe, expect, it } from "vitest";
import { promote } from "../src/promotion.js";

// Park–Miller LCG — deterministic across runs and platforms.
let seed = 20260612;
function rnd(): number {
  seed = (seed * 48271) % 2147483647;
  return seed / 2147483647;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const maybe = <T>(v: T): T | undefined => (rnd() < 0.5 ? v : undefined);

const TIMES = [
  "2026-06-01T00:00:00Z",
  "2026-06-10T00:00:00Z",
  "2026-06-12T00:00:00Z",
  "2026-07-05T00:00:00Z",
  "2026-03-31T11:30:00Z",
  "not-a-time",
  "",
];
const NAMES = ["impl-a", "impl-b", "impl-c", "stranger", ""];
const HASHES = [
  "sha256:" + "0".repeat(64),
  "sha256:" + "f".repeat(64),
  "garbage",
  "",
];
const STATES = ["proposed", "active", "deprecated", "disputed", "bogus"];
const ROLES = [["repo-owner"], ["maintainer"], ["repo-owner", "maintainer"], [], ["other"]];

function randomSpec(): unknown {
  if (rnd() < 0.1) return pick([null, 42, "spec", {}, []]);
  const implementers = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
    name: pick(NAMES),
    roles: pick(ROLES),
  }));
  const records: unknown[] = [
    {
      record: "preamble",
      name: "mini",
      conformanceVersion: "1.0.0",
      goals: [],
      contracts: [{ id: "c1", description: "c" }],
      exclusions: [],
      ...(rnd() < 0.5 ? { governance: { timeoutDays: pick([1, 30, 0, -5]) } } : {}),
      implementers,
    },
    { record: "item", id: "it1", body: "b", title: "t" },
  ];
  const n = Math.floor(rnd() * 3) + 1;
  for (let i = 0; i < n; i++) {
    records.push({
      record: "criterion",
      id: rnd() < 0.3 ? "ac1" : `ac${i + 1}`, // deliberate duplicate-id chances
      itemId: "it1",
      type: "scenario",
      class: "behavioral",
      gherkin: "Given x\nWhen y\nThen z",
      force: "MUST",
      state: pick(STATES),
      source: "forethought",
      contractId: rnd() < 0.8 ? "c1" : "c-nope",
      fixtures: rnd() < 0.8 ? ["fx1"] : [],
    });
  }
  records.push({
    record: "fixture",
    id: "fx1",
    contractId: "c1",
    description: "f",
    format: "json",
    input: {},
    expected: {},
  });
  return records;
}

function randomInput(): unknown {
  if (rnd() < 0.05) return pick([null, undefined, 7, "promotion", [], {}]);
  return {
    asOf: pick(TIMES),
    spec: randomSpec(),
    transition: rnd() < 0.05
      ? pick([null, "t", 9])
      : {
          criterionId: pick(["ac1", "ac2", "ac-nope", ""]),
          to: pick(["active", "rejected", "known-bug", "bogus"]),
          requestedAt: pick(TIMES),
          requestedBy: pick(NAMES),
          implementation: maybe("legacy-impl"),
          justification: maybe("j"),
          expiresAt: maybe(pick(TIMES)),
          attribution: maybe("a"),
          acknowledgments: rnd() < 0.05
            ? pick([null, "acks", 3])
            : Array.from({ length: Math.floor(rnd() * 5) }, () => ({
                implementer: pick(NAMES),
                decision: pick(["ack", "nak", "shrug"]),
                at: pick(TIMES),
                criterionHash: pick(HASHES),
              })),
        },
  };
}

const OUTCOMES = new Set(["ratified", "rejected", null]);

describe("promote() totality", () => {
  it("never throws and always returns a well-formed result (5000 adversarial inputs)", () => {
    for (let i = 0; i < 5000; i++) {
      const input = randomInput();
      const result = promote(input);
      expect(result).toBeTypeOf("object");
      expect(typeof result.accepted).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
      expect([...result.errors]).toEqual([...result.errors].sort());
      expect(result.accepted).toBe(result.errors.length === 0);
      expect(OUTCOMES.has(result.outcome)).toBe(true);
      expect(Array.isArray(result.lapsed)).toBe(true);
      expect(Array.isArray(result.stale)).toBe(true);
      expect(result.waiver === null || typeof result.waiver === "object").toBe(true);
    }
  });

  it("is deterministic: same input, same result", () => {
    for (let i = 0; i < 200; i++) {
      const input = randomInput();
      expect(promote(input)).toEqual(promote(JSON.parse(JSON.stringify(input ?? null))));
    }
  });
});
