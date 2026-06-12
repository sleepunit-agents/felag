#!/usr/bin/env node
// felag CLI — thin shell over the library. Verbs at 0.1.0: lint, fmt, hash, verify.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fixtureHash, parse, serialize } from "./canonical.js";
import { lint } from "./lint.js";
import { verify } from "./verify.js";
import type { Criterion, Fixture, SpecRecord, VerifyInput } from "./records.js";

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
  default:
    console.error("felag <lint|fmt|hash|verify> — felag/interchange + felag/verifier reference implementation");
    process.exit(2);
}
