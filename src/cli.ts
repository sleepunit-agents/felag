#!/usr/bin/env node
// felag CLI — thin shell over the library.
// Verbs: lint, fmt, hash, verify, graduate, prime, render, audit, promote,
// status, tasks, validate-author, validate-excavate, validate-prime.

import { readFileSync, writeFileSync, existsSync, watch } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fixtureHash, parse, serialize } from "./canonical.js";
import { lint } from "./lint.js";
import { verify } from "./verify.js";
import { graduate } from "./graduation.js";
import { promote } from "./promotion.js";
import { emitPrime } from "./prime.js";
import {
  renderInventory,
  validateAuthorOutput,
  validateExcavateOutput,
  validatePrimeOutput,
} from "./author.js";
import { audit } from "./audit.js";
import { computeStatus, renderStatusHTML } from "./status.js";
import { TaskStore } from "./tasks/store.js";
import { BeadsWorkLayer } from "./shims/beads.js";
import type { WorkLayer } from "./tasks/layer.js";
import type { TaskStatus } from "./tasks/store.js";
import type { Criterion, Fixture, RenderInventoryInput, SpecRecord, VerifyInput } from "./records.js";

// Exit codes: 0 ok / a meaningful negative is its own code (1 drift, 1
// not-graduated, …); 2 is a usage error; 3 is an INFRASTRUCTURE failure
// (unreadable or unparseable input file). Keeping 3 distinct from 1 lets a
// caller — CI, the MCP shim, a skill — tell "the spec said no" from "your path
// was wrong" instead of collapsing both into a bare nonzero.
const EXIT_IO = 3;

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(EXIT_IO);
}

/** Value of a `--flag <value>` option, or undefined. A following token that is
 * itself a flag (`--out --target`) is NOT consumed as the value — that bug
 * silently wrote a file literally named "--target". */
function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  return v !== undefined && !v.startsWith("--") ? v : undefined;
}

/** Read + JSON.parse a file, mapping any read/parse failure to a stable IO
 * error and exit 3 (never a raw V8 stack trace). */
function loadJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return fail(`cannot read ${path}: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return fail(`cannot parse ${path} as JSON: ${(e as Error).message}`);
  }
}

/** Read a JSONL evidence file into one object per non-empty line, guarded. */
function loadJsonl(path: string): unknown[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return fail(`cannot read ${path}: ${(e as Error).message}`);
  }
  const out: unknown[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    try {
      out.push(JSON.parse(lines[i]));
    } catch (e) {
      return fail(`cannot parse ${path} line ${i + 1} as JSON: ${(e as Error).message}`);
    }
  }
  return out;
}

// Work-layer selection: --store <file.json> (reference TaskStore persisted to
// a JSON file) or --beads <dir> (the bd conformance shim). Returns the layer
// plus a flush for the file-backed store.
function loadLayer(args: string[]): { layer: WorkLayer; flush: () => void } | null {
  const storeFile = flagValue(args, "--store");
  if (storeFile) {
    const store = existsSync(storeFile)
      ? new TaskStore(loadJson(storeFile) as { tasks: never[]; seq: number })
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
    if (!existsSync(p)) continue;
    try {
      records.push(...parse(readFileSync(p, "utf8")));
    } catch (e) {
      fail(`cannot read ${p}: ${(e as Error).message}`);
    }
  }
  if (records.length === 0) fail(`no interchange files (spec.jsonl/fixtures.jsonl) under ${dir}`);
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
    const asOf = flagValue(args, "--as-of") ?? new Date().toISOString();
    const waiversFile = flagValue(args, "--waivers");
    const input: VerifyInput = {
      asOf,
      implementation,
      records: loadJsonl(recordsFile) as VerifyInput["records"],
      spec: loadSpecDir(dir),
      waivers: waiversFile ? (loadJson(waiversFile) as VerifyInput["waivers"]) : [],
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
  case "render": {
    // felag render <spec-dir> --audience <stakeholder|developer|verifier> [--json]
    // Audience content projection — emits the RenderInventory ({included,
    // excludedFields}) as JSON. render is excluded surface (no contract, no
    // gate); the JSON lets a presentation client (a Claude skill) get the
    // projection without MCP wiring. JSON is the only output shape, so --json is
    // accepted but a harmless no-op — there for muscle-memory parity with
    // `felag status --json`.
    const VALUE_FLAGS = new Set(["--audience"]);
    const positional: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith("--")) { if (VALUE_FLAGS.has(a) && args[i + 1] !== undefined && !args[i + 1].startsWith("--")) i++; continue; }
      positional.push(a);
    }
    const dir = positional[0] ?? ".";
    const audience = flagValue(args, "--audience");
    const AUDIENCES = new Set(["stakeholder", "developer", "verifier"]);
    if (!audience || !AUDIENCES.has(audience)) {
      console.error("usage: felag render <spec-dir> --audience <stakeholder|developer|verifier> [--json]");
      process.exit(2);
    }
    const inventory = renderInventory({
      spec: loadSpecDir(dir),
      audience: audience as RenderInventoryInput["audience"],
    });
    console.log(JSON.stringify(inventory, null, 2));
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
    const waiversFile = flagValue(args, "--waivers");
    const input: VerifyInput = {
      asOf: flagValue(args, "--as-of") ?? new Date().toISOString(),
      implementation,
      records: loadJsonl(recordsFile) as VerifyInput["records"],
      spec: loadSpecDir(dir),
      waivers: waiversFile ? (loadJson(waiversFile) as VerifyInput["waivers"]) : [],
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
      records: loadJsonl(recordsFile),
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
      transition: loadJson(transitionFile),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.accepted ? 0 : 1);
  }
  case "status": {
    // felag status <spec-dir> [<records.jsonl> <impl>] [--target <id>] [--out <file>] [--as-of <iso>]
    //   --serve [--port <n>]   live-reloading localhost dashboard (the watched board)
    //   --json                 emit the computeStatus model as JSON to stdout
    // Records optional — without them every active criterion shows "unverified"
    // (still a useful spec view). Emits a self-contained HTML page by default;
    // --json emits the model instead so a presentation client (e.g. a Claude
    // skill) gets the same projection without MCP wiring. status is excluded
    // surface either way — no contract, no gate.
    const serve = args.includes("--serve");
    const json = args.includes("--json");
    // Positionals are flag-free; value-flags consume their next token so a flag
    // value (e.g. --target's id) is never mistaken for the spec-dir or records.
    const VALUE_FLAGS = new Set(["--target", "--out", "--as-of", "--port"]);
    const positional: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith("--")) { if (VALUE_FLAGS.has(a) && args[i + 1] !== undefined && !args[i + 1].startsWith("--")) i++; continue; }
      positional.push(a);
    }
    const dir = positional[0];
    if (!dir) {
      console.error("usage: felag status <spec-dir> [<records.jsonl> <impl>] [--target <id>] [--out <file>] [--json] [--serve [--port <n>]]");
      process.exit(2);
    }
    const recordsFile = positional[1];
    const implementation = positional[2];
    const target = flagValue(args, "--target");
    const asOf = flagValue(args, "--as-of");

    // Build the model fresh from disk (so --serve always reflects current files).
    const buildModel = () => {
      const records = recordsFile && existsSync(recordsFile)
        ? (loadJsonl(recordsFile) as VerifyInput["records"])
        : undefined;
      return computeStatus(loadSpecDir(dir), { records, implementation, asOf, target });
    };

    if (serve) {
      // The single persistent watched board: a dependency-free localhost server
      // that re-reads the spec/records on every request and live-reloads open
      // tabs (SSE) whenever spec.jsonl / fixtures.jsonl / the records file change.
      const reload = `<script>new EventSource("/events").onmessage=function(){location.reload()};</script>`;
      const page = () => renderStatusHTML(buildModel()).replace("</body>", `${reload}</body>`);

      const clients = new Set<ServerResponse>();
      const server = createServer((req, res) => {
        if (req.url === "/events") {
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
          res.write("retry: 1000\n\n");
          clients.add(res);
          req.on("close", () => clients.delete(res));
          return;
        }
        try {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(page());
        } catch (e) {
          res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          res.end(`felag status build error: ${(e as Error).message}`);
        }
      });

      // Debounced change → tell every open tab to reload. Watch the spec dir
      // (spec.jsonl/fixtures.jsonl live there) and the records file if given.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const ping = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { for (const res of clients) res.write("data: reload\n\n"); }, 120);
      };
      try { watch(dir, ping); } catch { /* watch unsupported — manual refresh still works */ }
      if (recordsFile) { try { watch(recordsFile, ping); } catch { /* file may be replaced atomically */ } }

      const requested = Number(flagValue(args, "--port") ?? 0);
      const announce = () => {
        const addr = server.address();
        const p = typeof addr === "object" && addr ? addr.port : requested;
        console.error(`felag status --serve → http://127.0.0.1:${p}  (watching ${dir}${recordsFile ? " + " + recordsFile : ""}; Ctrl-C to stop)`);
      };
      server.on("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "EADDRINUSE" && requested) {
          console.error(`port ${requested} in use — picking a free port`);
          server.listen(0, "127.0.0.1", announce);
        } else {
          console.error(`felag status --serve failed: ${e.message}`);
          process.exit(1);
        }
      });
      server.listen(requested || 4747, "127.0.0.1", announce);
      break; // keep the event loop alive; do not process.exit
    }

    const model = buildModel();
    if (json) {
      console.log(JSON.stringify(model, null, 2));
      process.exit(0);
    }
    const html = renderStatusHTML(model);
    const out = flagValue(args, "--out");
    if (out) {
      writeFileSync(out, html);
      console.error(`felag status → ${out} (${model.name} ${model.version}, ${model.verdict})`);
    } else {
      console.log(html);
    }
    process.exit(0);
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
      result = wl.layer.propose(loadJson(args[1]) as Parameters<typeof wl.layer.propose>[0]);
    } else if (sub === "transition") {
      result = wl.layer.transition(args[1], args[2] as TaskStatus);
    } else {
      result = wl.layer.report();
    }
    wl.flush();
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  case "validate-author": {
    // felag validate-author <spec-dir> <new.json> [--budgets <n>]
    // new.json: a JSON array of the criterion ids this authoring interview produced.
    const [dir, newFile] = args;
    if (!dir || !newFile) {
      console.error("usage: felag validate-author <spec-dir> <new.json> [--budgets <n>]");
      process.exit(2);
    }
    const budgets = flagValue(args, "--budgets");
    const result = validateAuthorOutput({
      spec: loadSpecDir(dir),
      new: loadJson(newFile) as string[],
      ...(budgets ? { budgets: { criteriaPerItem: Number(budgets) } } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  case "validate-excavate": {
    // felag validate-excavate <spec-dir> <scope.json>
    // scope.json: {"contracts":[...]} or null.
    const [dir, scopeFile] = args;
    if (!dir || !scopeFile) {
      console.error("usage: felag validate-excavate <spec-dir> <scope.json>");
      process.exit(2);
    }
    const result = validateExcavateOutput({
      spec: loadSpecDir(dir),
      scope: loadJson(scopeFile) as { contracts: string[] } | null,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  case "validate-prime": {
    // felag validate-prime <spec-dir> <output-file>
    // output-file: the prime brief text to validate against the spec.
    const [dir, outputFile] = args;
    if (!dir || !outputFile) {
      console.error("usage: felag validate-prime <spec-dir> <output-file>");
      process.exit(2);
    }
    let output: string;
    try {
      output = readFileSync(outputFile, "utf8");
    } catch (e) {
      fail(`cannot read ${outputFile}: ${(e as Error).message}`);
    }
    const result = validatePrimeOutput({ spec: loadSpecDir(dir), output: output! });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  default:
    console.error(
      "felag <lint|fmt|hash|verify|graduate|prime|render|audit|promote|status|tasks|" +
        "validate-author|validate-excavate|validate-prime> — felag reference implementation " +
        "(interchange + verifier + tasks; author-class validators)",
    );
    process.exit(2);
}
