// The conformance harness: spec/felag-core/fixtures.jsonl IS the test suite.
// Each fixture's format selects the implementation surface under test.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureHash, parse, serialize } from "../src/canonical.js";
import { lint } from "../src/lint.js";
import { ingest, verify } from "../src/verify.js";
import { graduate, ingestJudgment } from "../src/graduation.js";
import { promote } from "../src/promotion.js";
import {
  renderInventory,
  validateAuthorOutput,
  validateExcavateOutput,
  validatePrimeOutput,
} from "../src/author.js";
import type {
  AuthorOutputInput,
  ExcavateOutputInput,
  Fixture,
  PrimeOutputInput,
  RenderInventoryInput,
  SpecRecord,
  VerifyInput,
} from "../src/records.js";

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
        case "felag/promotion-input@0": {
          expect(promote(fx.input)).toEqual(fx.expected);
          break;
        }
        case "felag/judgment-ingest@0": {
          expect(ingestJudgment(fx.input)).toEqual(fx.expected);
          break;
        }
        case "felag/graduation-input@0": {
          expect(graduate(fx.input)).toEqual(fx.expected);
          break;
        }
        case "felag/author-output@0": {
          expect(validateAuthorOutput(fx.input as AuthorOutputInput)).toEqual(fx.expected);
          break;
        }
        case "felag/excavate-output@0": {
          expect(validateExcavateOutput(fx.input as ExcavateOutputInput)).toEqual(fx.expected);
          break;
        }
        case "felag/render-inventory@0": {
          expect(renderInventory(fx.input as RenderInventoryInput)).toEqual(fx.expected);
          break;
        }
        case "felag/prime-output@0": {
          expect(validatePrimeOutput(fx.input as PrimeOutputInput)).toEqual(fx.expected);
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

  // Governance ack currency: every committed ratification ack must bind the
  // COMMITTED criterion text (state flipped back to proposed — the line as
  // acknowledged). Triplet replay alone proves only the snapshot; this
  // catches text drift after ratification, which silently un-ratifies.
  it("governance acks are current against the committed spec", () => {
    const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
    const govDir = join(__dirname, "..", "governance");
    for (const f of readdirSync(govDir).filter((f) => f.endsWith(".transition.json"))) {
      const t = JSON.parse(readFileSync(join(govDir, f), "utf8")) as {
        criterionId: string;
        acknowledgments: { criterionHash: string }[];
      };
      const c = spec.find(
        (r) => r.record === "criterion" && r.id === t.criterionId,
      );
      expect(c, `${t.criterionId} missing from committed spec`).toBeDefined();
      const asProposed = { ...(c as object), state: "proposed" };
      for (const a of t.acknowledgments) {
        expect(a.criterionHash, `${f}: stale ack`).toBe(fixtureHash(asProposed));
      }
    }
  });
});
