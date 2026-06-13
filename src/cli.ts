#!/usr/bin/env node
// felag CLI — thin shell over the library.
// Verbs: lint, fmt, hash, verify, graduate, prime, audit, promote, tasks.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fixtureHash, parse, serialize } from "./canonical.js";
import { lint } from "./lint.js";
import { verify } from "./verify.js";
import { graduate } from "./graduation.js";
import { promote } from "./promotion.js";
import { emitPrime } from "./prime.js";
import { audit } from "./audit.js";
import { TaskStore } from "./tasks/store.js";
import { BeadsWorkLayer } from "./shims/beads.js";
import type { WorkLayer } from "./tasks/layer.js";
import type { TaskStatus } from "./tasks/store.js";
import type { Criterion, Fixture, SpecRecord, VerifyInput } from "./records.js";

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

// Work-layer selection: --store <file.json> (reference TaskStore persisted to
// a JSON file) or --beads <dir> (the bd conformance shim). Returns the layer
// plus a flush for the file-backed store.
function loadLayer(args: string[]): { layer: WorkLayer; flush: () => void } | null {
  const storeFile = flagValue(args, "--store");
  if (storeFile) {
    const store = existsSync(storeFile)
      ? new TaskStore(JSON.parse(readFileSync(storeFile, "utf8")))
      : new TaskStore();
    return {
      layer: store,
      flush: () => writeFileSync(storeFile, JSON.stringify(store.snapshot(), null, 2) + "\n"),
    };
  }
  const beadsDir = flagValue(args, "--beads");
  if (beadsDir) return { layer: new BeadsWorkLayer(beadsDir), flush: () => {} };
  return null;
}

function loadSpecDir(dir: string): SpecRecord[] {
  const records: SpecRecord[] = [];
  for (const file of ["spec.jsonl", "fixtures.jsonl"]) {
    const p = join(dir, file);
    if (existsSync(p)) records.push(...parse(readFileSync(p, "utf8")));
  }
  if (records.length === 0) throw new Error(`no interchange files under ${dir}`);
  return records;
}

const [, , verb, ...args] = process.argv;

switch (verb) {
  case "lint": {
    const records = loadSpecDir(args[0] ?? ".");
    const result = lint(records);
    // Orphan-fixture warning (stderr only — the lintResult contract is
    // unchanged): a committed fixture referenced by no criterion is a silent
    // interop proof for nothing. This exact gap shipped prime half-compiled
    // at 1.0.0; a criterion binding was missing and nothing flagged it.
    const referenced = new Set(
      records.flatMap((r) => (r.record === "criterion" ? (r as Criterion).fixtures : [])),
    );
    for (const r of records) {
      if (r.record === "fixture" && !referenced.has((r as Fixture).id)) {
        console.error(`warning: fixture ${(r as Fixture).id} is referenced by no criterion`);
      }
    }
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  case "fmt": {
    // Canonicalize interchange files in place (writers strict).
    const dir = args[0] ?? ".";
    for (const file of ["spec.jsonl", "fixtures.jsonl"]) {
      const p = join(dir, file);
      if (!existsSync(p)) continue;
      writeFileSync(p, serialize(parse(readFileSync(p, "utf8"))));
      console.log(`canonicalized ${p}`);
    }
    process.exit(0);
  }
  case "hash": {
    const records = loadSpecDir(args[0] ?? ".");
    for (const r of records) {
      if (r.record === "fixture" && (!args[1] || (r as Fixture).id === args[1])) {
        console.log(`${(r as Fixture).id} ${fixtureHash(r)}`);
      }
    }
    process.exit(0);
  }
  case "verify": {
    // felag verify <spec-dir> <records.jsonl> <implementation> [--as-of <iso>] [--waivers <file>]
    const [dir, recordsFile, implementation] = args;
    if (!dir || !recordsFile || !implementation) {
      console.error("usage: felag verify <spec-dir> <records.jsonl> <implementation> [--as-of <iso>] [--waivers <file>]");
      process.exit(2);
    }
    const asOf = args.includes("--as-of") ? args[args.indexOf("--as-of") + 1] : new Date().toISOString();
    const waivers = args.includes("--waivers")
      ? JSON.parse(readFileSync(args[args.indexOf("--waivers") + 1], "utf8"))
      : [];
    const input: VerifyInput = {
      asOf,
      implementation,
      records: readFileSync(recordsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)),
      spec: loadSpecDir(dir),
      waivers,
    };
    const report = verify(input);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.verdict === "drifts" ? 1 : 0);
  }
  case "prime": {
    // felag prime <spec-dir> — emit the author-class protocol brief.
    console.log(emitPrime(loadSpecDir(args[0] ?? ".")));
    process.exit(0);
  }
  case "audit": {
    // felag audit <spec-dir> <records.jsonl> <implementation>
    //   [--as-of <iso>] [--waivers <file>] [--store <file>|--beads <dir>]
    const [dir, recordsFile, implementation] = args;
    if (!dir || !recordsFile || !implementation) {
      console.error(
        "usage: felag audit <spec-dir> <records.jsonl> <implementation> [--as-of <iso>] [--waivers <file>] [--store <file>|--beads <dir>]",
      );
      process.exit(2);
    }
    const input: VerifyInput = {
      asOf: flagValue(args, "--as-of") ?? new Date().toISOString(),
      implementation,
      records: readFileSync(recordsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)),
      spec: loadSpecDir(dir),
      waivers: (() => {
        const f = flagValue(args, "--waivers");
        return f ? JSON.parse(readFileSync(f, "utf8")) : [];
      })(),
    };
    const wl = loadLayer(args);
    const result = audit(input, wl?.layer);
    wl?.flush();
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  case "graduate": {
    // felag graduate <spec-dir> <records.jsonl> <implementation> <criterionId>
    const [dir, recordsFile, implementation, criterionId] = args;
    if (!dir || !recordsFile || !implementation || !criterionId) {
      console.error("usage: felag graduate <spec-dir> <records.jsonl> <implementation> <criterionId>");
      process.exit(2);
    }
    const result = graduate({
      criterionId,
      implementation,
      records: readFileSync(recordsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)),
      spec: loadSpecDir(dir),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.graduated ? 0 : 1);
  }
  case "promote": {
    // felag promote <spec-dir> <transition.json> [--as-of <iso>]
    const [dir, transitionFile] = args;
    if (!dir || !transitionFile) {
      console.error("usage: felag promote <spec-dir> <transition.json> [--as-of <iso>]");
      process.exit(2);
    }
    const result = promote({
      asOf: flagValue(args, "--as-of") ?? new Date().toISOString(),
      spec: loadSpecDir(dir),
      transition: JSON.parse(readFileSync(transitionFile, "utf8")),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.accepted ? 0 : 1);
  }
  case "tasks": {
    // felag tasks <propose|transition|report> (--store <file>|--beads <dir>)
    //   propose <proposal.json> | transition <taskRef> <status> | report
    const sub = args[0];
    const wl = loadLayer(args);
    if (!wl || !["propose", "transition", "report"].includes(sub ?? "")) {
      console.error(
        "usage: felag tasks <propose <proposal.json>|transition <taskRef> <status>|report> (--store <file>|--beads <dir>)",
      );
      process.exit(2);
    }
    let result: unknown;
    if (sub === "propose") {
      result = wl.layer.propose(JSON.parse(readFileSync(args[1], "utf8")));
    } else if (sub === "transition") {
      result = wl.layer.transition(args[1], args[2] as TaskStatus);
    } else {
      result = wl.layer.report();
    }
    wl.flush();
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  default:
    console.error(
      "felag <lint|fmt|hash|verify|graduate|prime|audit|promote|tasks> — felag reference implementation (interchange + verifier + tasks; author-class validators)",
    );
    process.exit(2);
}
