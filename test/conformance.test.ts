// The conformance harness: spec/felag-core/fixtures.jsonl IS the test suite.
// Each fixture's format selects the implementation surface under test.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureHash, parse, serialize } from "../src/canonical.js";
import { lint } from "../src/lint.js";
import { ingest, verify } from "../src/verify.js";
import type { Fixture, SpecRecord, VerifyInput } from "../src/records.js";

const dir = join(__dirname, "..", "spec", "felag-core");
const fixtures = readFileSync(join(dir, "fixtures.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Fixture);

describe("felag-core fixture corpus", () => {
  for (const fx of fixtures) {
    it(`${fx.id} — ${fx.description.slice(0, 70)}`, () => {
      switch (fx.format) {
        case "felag/jsonl-text@0": {
          const records = parse(fx.input as string);
          expect(serialize(records)).toBe(fx.expected as string);
          break;
        }
        case "felag/fixture-hash@0": {
          const expected = fx.expected as { fixtureHash: string };
          expect(fixtureHash(fx.input as object)).toBe(expected.fixtureHash);
          break;
        }
        case "felag/lint-input@0": {
          const input = fx.input as { spec: SpecRecord[] };
          expect(lint(input.spec)).toEqual(fx.expected);
          break;
        }
        case "felag/record-ingest@0": {
          expect(ingest(fx.input)).toEqual(fx.expected);
          break;
        }
        case "felag/verify-input@0": {
          expect(verify(fx.input as VerifyInput)).toEqual(fx.expected);
          break;
        }
        default:
          throw new Error(`unknown fixture format: ${fx.format}`);
      }
    });
  }

  it("spec/felag-core files are themselves canonical (round-trip byte-identical)", () => {
    for (const file of ["spec.jsonl", "fixtures.jsonl"]) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(serialize(parse(text))).toBe(text);
    }
  });

  it("spec/felag-core passes its own lint", () => {
    const all = [
      ...parse(readFileSync(join(dir, "spec.jsonl"), "utf8")),
      ...parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")),
    ];
    expect(lint(all)).toEqual({ valid: true, errors: [] });
  });
});
