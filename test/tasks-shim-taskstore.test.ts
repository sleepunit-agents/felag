// The taskstore adapter runs the SAME felag-tasks fixture corpus as the
// reference implementation and the beads shim — the first-party work store
// conforms to the c-tasks contract through felag's CLI driver, proven on the
// shared fixtures. Each fixture gets a fresh, isolated store (TASKSTORE_DB
// pinned under a temp dir) so a run never touches an ambient store.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/canonical.js";
import { runOps, type Op } from "../src/tasks/run-ops.js";
import { TaskstoreWorkLayer } from "../src/shims/taskstore.js";
import type { Fixture } from "../src/records.js";

function taskstoreAvailable(): boolean {
  try {
    execFileSync("which", ["taskstore"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const dir = join(__dirname, "..", "spec", "felag-tasks");
const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8")) as Fixture[];

describe.skipIf(!taskstoreAvailable())("felag-tasks fixture corpus (taskstore adapter)", () => {
  for (const fx of fixtures) {
    it(`${fx.id} — ${fx.description.slice(0, 60)}`, () => {
      const sandbox = mkdtempSync(join(tmpdir(), "felag-taskstore-shim-"));
      mkdirSync(join(sandbox, ".taskstore"), { recursive: true });
      try {
        const input = fx.input as { ops: Op[] };
        const expected = fx.expected as { results: unknown[] };
        expect(runOps(input.ops, new TaskstoreWorkLayer(sandbox))).toEqual(expected.results);
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });
  }
});
