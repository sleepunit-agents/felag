// The loop closes: run the felag-core fixture corpus through this
// implementation as the runner, emit VerificationRecords for every gating
// criterion, then ask verify() — the ledger — for the conformance verdict of
// this implementation against spec/felag-core.
//
// This script is the Binding for implementation "felag-ts": it maps each
// fixture format onto the library surface and names itself as the runner.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fixtureHash, parse, serialize } from "../src/canonical.js";
import { lint } from "../src/lint.js";
import { ingest, verify } from "../src/verify.js";
import { promote } from "../src/promotion.js";
import {
  renderInventory,
  validateAuthorOutput,
  validateExcavateOutput,
  validatePrimeOutput,
} from "../src/author.js";
import type {
  AuthorOutputInput,
  Criterion,
  ExcavateOutputInput,
  Fixture,
  PrimeOutputInput,
  RenderInventoryInput,
  SpecRecord,
  VerificationRecord,
  VerifyInput,
} from "../src/records.js";

const IMPLEMENTATION = "felag-ts";
const IMPLEMENTATION_VERSION = "2.0.0";
const dir = join(import.meta.dirname, "..", "spec", "felag-core");
const at = new Date().toISOString();

const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];
const all: SpecRecord[] = [...spec, ...fixtures];
const fixturesById = new Map(fixtures.map((f) => [f.id, f]));
const conformanceVersion = (spec.find((r) => r.record === "preamble") as { conformanceVersion: string })
  .conformanceVersion;

function runFixture(fx: Fixture): "pass" | "fail" {
  try {
    let ok: boolean;
    switch (fx.format) {
      case "felag/jsonl-text@0":
        ok = serialize(parse(fx.input as string)) === fx.expected;
        break;
      case "felag/fixture-hash@0":
        ok = fixtureHash(fx.input as object) === (fx.expected as { fixtureHash: string }).fixtureHash;
        break;
      case "felag/lint-input@0":
        ok = eq(lint((fx.input as { spec: SpecRecord[] }).spec), fx.expected);
        break;
      case "felag/record-ingest@0":
        ok = eq(ingest(fx.input), fx.expected);
        break;
      case "felag/verify-input@0":
        ok = eq(verify(fx.input as VerifyInput), fx.expected);
        break;
      case "felag/promotion-input@0":
        ok = eq(promote(fx.input), fx.expected);
        break;
      case "felag/author-output@0":
        ok = eq(validateAuthorOutput(fx.input as AuthorOutputInput), fx.expected);
        break;
      case "felag/excavate-output@0":
        ok = eq(validateExcavateOutput(fx.input as ExcavateOutputInput), fx.expected);
        break;
      case "felag/render-inventory@0":
        ok = eq(renderInventory(fx.input as RenderInventoryInput), fx.expected);
        break;
      case "felag/prime-output@0":
        ok = eq(validatePrimeOutput(fx.input as PrimeOutputInput), fx.expected);
        break;
      default:
        return "fail";
    }
    return ok ? "pass" : "fail";
  } catch {
    return "fail";
  }
}

// Structural equality via key-sorted serialization of BOTH sides — JSON key
// order is not significant in tool results, only in canonical interchange.
function eq(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(sortKeys(actual)) === JSON.stringify(sortKeys(expected));
}

// Deep-sort object keys so JSON.stringify comparison is order-insensitive.
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, val]) => [k, sortKeys(val)]),
    );
  }
  return v;
}

const records: VerificationRecord[] = [];
for (const r of all) {
  if (r.record !== "criterion") continue;
  const c = r as Criterion;
  for (const fxId of c.fixtures) {
    const fx = fixturesById.get(fxId);
    if (!fx) continue;
    records.push({
      criterionId: c.id,
      fixtureId: fxId,
      fixtureHash: fixtureHash(fx),
      implementation: IMPLEMENTATION,
      implementationVersion: IMPLEMENTATION_VERSION,
      conformanceVersion,
      verdict: runFixture(fx),
      evidence: `scripts/self-verify.ts fixture run at ${at}`,
      runner: "felag-ts/self-verify",
      at,
      attribution: `art@one self-verify`,
    });
  }
}

// Validate our own records through the ledger's front door before deriving.
for (const rec of records) {
  const result = ingest(rec);
  if (!result.accepted) {
    console.error(`record rejected: ${JSON.stringify(result)} for ${rec.criterionId}`);
    process.exit(1);
  }
}

const input: VerifyInput = { asOf: at, implementation: IMPLEMENTATION, records, spec: all, waivers: [] };
const report = verify(input);

mkdirSync(join(import.meta.dirname, "..", "verification"), { recursive: true });
writeFileSync(
  join(import.meta.dirname, "..", "verification", `${IMPLEMENTATION}.records.jsonl`),
  records.map((r) => JSON.stringify(r)).join("\n") + "\n",
);
writeFileSync(
  join(import.meta.dirname, "..", "verification", `${IMPLEMENTATION}.report.json`),
  JSON.stringify(report, null, 2) + "\n",
);

console.log(JSON.stringify(report, null, 2));
console.log(
  `\n${IMPLEMENTATION} ${IMPLEMENTATION_VERSION} vs felag-core ${conformanceVersion}: ${report.verdict.toUpperCase()}` +
    ` (${records.length} records, ${report.failing.length} failing, ${report.waived.length} waived)`,
);
process.exit(report.verdict === "drifts" ? 1 : 0);
