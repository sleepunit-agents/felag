// The beads conformance shim runs the SAME felag-tasks fixture corpus as the
// reference implementation — that sameness is the entire point: a foreign
// tracker conforms via mapping, proven on the shared fixtures.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/canonical.js";
import { runOps, type Op } from "../src/tasks/run-ops.js";
import { BeadsWorkLayer } from "../src/shims/beads.js";
import type { Fixture } from "../src/records.js";

function bdAvailable(): boolean {
  try {
    execFileSync("bd", ["version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

const dir = join(__dirname, "..", "spec", "felag-tasks");
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];

describe.skipIf(!bdAvailable())("felag-tasks fixture corpus (beads shim)", () => {
  for (const fx of fixtures) {
    it(`${fx.id} — ${fx.description.slice(0, 60)}`, () => {
      const sandbox = mkdtempSync(join(tmpdir(), "felag-beads-shim-"));
      try {
        execFileSync("git", ["init", "-q"], { cwd: sandbox, stdio: "pipe" });
        execFileSync("bd", ["init", "--prefix", "shim"], { cwd: sandbox, stdio: "pipe" });
        const input = fx.input as { ops: Op[] };
        const expected = fx.expected as { results: unknown[] };
        expect(runOps(input.ops, new BeadsWorkLayer(sandbox))).toEqual(expected.results);
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });
  }
});
