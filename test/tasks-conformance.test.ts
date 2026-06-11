// felag-tasks conformance harness — spec/felag-tasks/fixtures.jsonl drives it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/canonical.js";
import { lint } from "../src/lint.js";
import { runOps, type Op } from "../src/tasks/run-ops.js";
import type { Fixture, SpecRecord } from "../src/records.js";

const dir = join(__dirname, "..", "spec", "felag-tasks");
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];

describe("felag-tasks fixture corpus (reference implementation)", () => {
  for (const fx of fixtures) {
    it(`${fx.id} — ${fx.description.slice(0, 70)}`, () => {
      if (fx.format !== "felag-tasks/op-sequence@0") throw new Error(`unknown format ${fx.format}`);
      const input = fx.input as { ops: Op[] };
      const expected = fx.expected as { results: unknown[] };
      expect(runOps(input.ops)).toEqual(expected.results);
    });
  }

  it("spec/felag-tasks passes lint and is canonical", () => {
    const all: SpecRecord[] = [
      ...parse(readFileSync(join(dir, "spec.jsonl"), "utf8")),
      ...parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")),
    ];
    expect(lint(all)).toEqual({ valid: true, errors: [] });
  });
});
