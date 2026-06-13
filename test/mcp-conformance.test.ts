// felag-mcp conformance harness — spec/felag-mcp/fixtures.jsonl drives it.
// Each fixture is a (tool-call, filesystem snapshot) -> result envelope.
//
// Error-case comparison is structural: the error CODE is normative, the detail
// WORDING is not. So for {ok:false} expectations we compare {ok, error} exactly
// and assert detail is a non-empty string; for {ok:true} we compare the whole
// envelope (the result shape IS the contract).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureHash, parse, serialize } from "../src/canonical.js";
import { lint } from "../src/lint.js";
import { mcpDispatch, type FsSnapshot, type McpCall } from "../src/mcp/dispatch.js";
import type { Fixture, SpecRecord } from "../src/records.js";

const dir = join(__dirname, "..", "spec", "felag-mcp");
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];

describe("felag-mcp fixture corpus (reference implementation)", () => {
  for (const fx of fixtures) {
    it(`${fx.id} — ${fx.description.slice(0, 70)}`, () => {
      if (fx.format !== "felag/mcp-dispatch@0") throw new Error(`unknown format ${fx.format}`);
      const input = fx.input as { call: McpCall; fs?: FsSnapshot };
      const expected = fx.expected as
        | { ok: true; result: unknown }
        | { ok: false; error: string };
      const actual = mcpDispatch(input.call, input.fs);

      if (expected.ok === false) {
        expect(actual.ok).toBe(false);
        if (actual.ok === false) {
          expect(actual.error).toBe(expected.error);
          expect(typeof actual.detail).toBe("string");
          expect(actual.detail.length).toBeGreaterThan(0);
        }
      } else {
        expect(actual).toEqual(expected);
      }
    });
  }

  it("spec/felag-mcp passes lint and is canonical", () => {
    const all: SpecRecord[] = [
      ...parse(readFileSync(join(dir, "spec.jsonl"), "utf8")),
      ...parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")),
    ];
    expect(lint(all)).toEqual({ valid: true, errors: [] });
    for (const file of ["spec.jsonl", "fixtures.jsonl"]) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(serialize(parse(text))).toBe(text);
    }
  });

  // Governance ack currency (mirrors the felag-core check, scoped to this
  // unit's own governance dir): every committed ratification ack must bind the
  // COMMITTED criterion text as proposed — catches text drift that silently
  // un-ratifies. felag-mcp's triplets live under spec/felag-mcp/governance/.
  it("governance acks are current against the committed spec", () => {
    const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
    const govDir = join(dir, "governance");
    for (const file of readdirSync(govDir).filter((f) => f.endsWith(".transition.json"))) {
      const t = JSON.parse(readFileSync(join(govDir, file), "utf8")) as {
        criterionId: string;
        acknowledgments: { criterionHash: string }[];
      };
      const c = spec.find((r) => r.record === "criterion" && r.id === t.criterionId);
      expect(c, `${t.criterionId} missing from committed spec`).toBeDefined();
      const asProposed = { ...(c as object), state: "proposed" };
      for (const a of t.acknowledgments) {
        expect(a.criterionHash, `${file}: stale ack`).toBe(fixtureHash(asProposed));
      }
    }
  });
});
