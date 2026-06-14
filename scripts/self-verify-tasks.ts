// Self-verification of the felag-tasks reference implementation against
// spec/felag-tasks — VerificationRecords through the ledger's front door.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fixtureHash, parse } from "../src/canonical.js";
import { ingest, verify } from "../src/verify.js";
import { runOps, type Op } from "../src/tasks/run-ops.js";
import { BeadsWorkLayer } from "../src/shims/beads.js";
import { TaskstoreWorkLayer } from "../src/shims/taskstore.js";
import type { WorkLayer } from "../src/tasks/layer.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { Criterion, Fixture, SpecRecord, VerificationRecord, VerifyInput } from "../src/records.js";

// --impl <ref|beads|taskstore> selects the implementation under test. ref is
// the in-memory TaskStore (no layer); beads + taskstore drive a foreign and the
// first-party store through their shims against a fresh sandbox store per
// fixture (so the run never touches an ambient/live store).
const implArg = process.argv.includes("--impl") ? process.argv[process.argv.indexOf("--impl") + 1] : "ref";
const IMPL = (["ref", "beads", "taskstore"].includes(implArg) ? implArg : "ref") as "ref" | "beads" | "taskstore";
const IMPLEMENTATION =
  IMPL === "beads"
    ? "felag-tasks-beads-shim"
    : IMPL === "taskstore"
      ? "felag-tasks-taskstore-shim"
      : "felag-tasks-ref";
const IMPLEMENTATION_VERSION = "0.1.0";

function makeLayer(): { layer?: WorkLayer; cleanup: () => void } {
  if (IMPL === "beads") {
    const sandbox = mkdtempSync(join(tmpdir(), "felag-beads-sv-"));
    execFileSync("git", ["init", "-q"], { cwd: sandbox, stdio: "pipe" });
    execFileSync("bd", ["init", "--prefix", "sv"], { cwd: sandbox, stdio: "pipe" });
    return { layer: new BeadsWorkLayer(sandbox), cleanup: () => rmSync(sandbox, { recursive: true, force: true }) };
  }
  if (IMPL === "taskstore") {
    const sandbox = mkdtempSync(join(tmpdir(), "felag-taskstore-sv-"));
    mkdirSync(join(sandbox, ".taskstore"), { recursive: true });
    return { layer: new TaskstoreWorkLayer(sandbox), cleanup: () => rmSync(sandbox, { recursive: true, force: true }) };
  }
  return { cleanup: () => {} };
}
const dir = join(import.meta.dirname, "..", "spec", "felag-tasks");
// Deterministic provenance stamp (see scripts/self-verify.ts): keeps the
// committed records from churning the working tree on every run. --stamp for a
// live wall-clock instant.
const at = process.argv.includes("--stamp") ? new Date().toISOString() : "2026-06-13T00:00:00Z";

const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];
const all: SpecRecord[] = [...spec, ...fixtures];
const fixturesById = new Map(fixtures.map((f) => [f.id, f]));
const conformanceVersion = (spec.find((r) => r.record === "preamble") as { conformanceVersion: string })
  .conformanceVersion;

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sortKeys(x)]),
    );
  return v;
}

function runFixture(fx: Fixture): "pass" | "fail" {
  const { layer, cleanup } = makeLayer();
  try {
    const input = fx.input as { ops: Op[] };
    const expected = fx.expected as { results: unknown[] };
    return JSON.stringify(sortKeys(runOps(input.ops, layer))) === JSON.stringify(sortKeys(expected.results))
      ? "pass"
      : "fail";
  } catch {
    return "fail";
  } finally {
    cleanup();
  }
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
      evidence: `scripts/self-verify-tasks.ts fixture run at ${at}`,
      runner: `${IMPLEMENTATION}/self-verify`,
      at,
      attribution: "art@one self-verify",
    });
  }
}

for (const rec of records) {
  const result = ingest(rec);
  if (!result.accepted) {
    console.error(`record rejected: ${JSON.stringify(result)} for ${rec.criterionId}`);
    process.exit(1);
  }
}

const report = verify({ asOf: at, implementation: IMPLEMENTATION, records, spec: all, waivers: [] } as VerifyInput);
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
  `\n${IMPLEMENTATION} ${IMPLEMENTATION_VERSION} vs felag-tasks ${conformanceVersion}: ${report.verdict.toUpperCase()} (${records.length} records, ${report.failing.length} failing)`,
);
process.exit(report.verdict === "drifts" ? 1 : 0);
