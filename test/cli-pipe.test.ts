// The CLI binding's own tests. Everything under test here is a property of
// the PROCESS — its stdout, its exit status — so it's unreachable from the
// core suite, which calls the library functions in-process and never spawns
// anything.
//
// t-579 (filed 2026-09-08, taskstore work tracking): felag's CLI switch ends
// every verb with `console.log(JSON.stringify(result)); process.exit(n)`.
// That is exactly the shape that truncated taskstore's `export` at exactly
// 65,536 bytes down a pipe, at exit 0, on 2026-09-08 (see
// ~/Code/taskstore/test/cli-binding.test.ts): stdout to a pipe is a
// non-blocking fd, a write past the kernel pipe buffer is queued, and
// process.exit() tears down the process without draining the queue. t-579
// filed this as LATENT — every felag output producible against the repo's
// own specs at the time fit in one 64 KiB buffer, so the defect could not be
// witnessed, only reasoned about from the code shape.
//
// Witnessed here with a synthetic spec sized past the buffer. render's
// RenderInventory is a flat list of record ids — the cheapest way to control
// output size exactly: each fixture id is padded past the pipe buffer with a
// handful of records, not a sprawling spec. render --audience verifier
// includes every fixture id, so it is also the thinnest command to drive.
//
// The pipe has to be a REAL pipe, which is why this goes through `sh -c`
// rather than child_process stdio "pipe" (a UNIX socketpair, several times a
// pipe's 64 KiB — it would not reproduce the bug this file is pinning down).

import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const repo = join(__dirname, "..");
// The BUILT artifact, not the TypeScript source through a loader — the bug
// is a property of the compiled binding (process.exit timing), and this is
// the project's only process-level suite.
const cli = `node '${join(repo, "dist", "cli.js")}'`;

let dir: string;

interface Run {
  stdout: string;
  stderr: string;
  code: number;
}

function sh(command: string): Promise<Run> {
  return new Promise((resolve, reject) => {
    execFile(
      "sh",
      ["-c", command],
      { cwd: repo, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && typeof (err as unknown as { code?: unknown }).code !== "number") return reject(err);
        resolve({ stdout, stderr, code: err ? (err as unknown as { code: number }).code : 0 });
      },
    );
  });
}

// The CLI's own status from inside a pipeline, written to a file by the
// subshell that runs it. POSIX sh has no pipefail, and the shell's status is
// the LAST stage's (the reader's) — so a CLI that "succeeded" into a
// truncated pipe would otherwise be reported as whatever `cat` thought of it.
let statusSeq = 0;
async function statusOf(cliArgs: string, rest: string): Promise<number> {
  const stFile = join(dir, `status-${statusSeq++}`);
  await sh(`( ${cli} ${cliArgs}; echo $? > '${stFile}' ) ${rest}`);
  return Number(readFileSync(stFile, "utf8").trim());
}

beforeAll(() => {
  // Build once, so `cli` above is the current source (dist/ is gitignored).
  execFileSync("npm", ["run", "build"], { cwd: repo, stdio: "pipe" });

  dir = mkdtempSync(join(tmpdir(), "felag-cli-pipe-"));
  // fixtures.jsonl alone satisfies loadSpecDir (>=1 record across the two
  // interchange files); render's audience projection only ever touches
  // .record and .id, so these fixtures need nothing schema-complete.
  // Each id is padded well past the 64 KiB pipe buffer's share — the whole
  // file is ~340 KB of fixture rows, not one giant record, which is the
  // shape a real large spec would actually take.
  const padding = "a".repeat(60);
  const lines: string[] = [];
  for (let i = 0; i < 2000; i++) {
    lines.push(
      JSON.stringify({
        record: "fixture",
        id: `fx-${padding}-${i}`,
        description: "d",
        format: "json",
        input: null,
        expected: null,
      }),
    );
  }
  writeFileSync(join(dir, "fixtures.jsonl"), lines.join("\n") + "\n");
});

describe("stdout survives a pipe (t-579)", () => {
  it("render emits the same bytes down a pipe as to a file, past one 64 KiB buffer", async () => {
    const direct = join(dir, "direct.json");
    const piped = join(dir, "piped.json");
    expect((await sh(`${cli} render '${dir}' --audience verifier > '${direct}'`)).code).toBe(0);
    expect(await statusOf(`render '${dir}' --audience verifier`, `| cat > '${piped}'`)).toBe(0);

    expect(statSync(direct).size).toBeGreaterThan(65536); // else this proves nothing
    expect(statSync(piped).size).toBe(statSync(direct).size);
    expect(readFileSync(piped).equals(readFileSync(direct))).toBe(true);
  });

  it("render emits parseable JSON down a pipe, not a 64 KiB prefix", async () => {
    const piped = join(dir, "piped-parse.json");
    expect(await statusOf(`render '${dir}' --audience verifier`, `| cat > '${piped}'`)).toBe(0);
    const parsed = JSON.parse(readFileSync(piped, "utf8")) as { included: string[] };
    expect(parsed.included.length).toBe(2000);
  });
});

// The exitCode refactor (t-579's fix) replaced every success-path
// `process.exit(n)` with `process.exitCode = n` so Node drains stdout before
// exiting naturally. Usage-error exits were left untouched on purpose — they
// fire before any JSON is produced, and several sit mid-case ahead of code
// that would otherwise run on undefined positionals if exitCode fell
// through instead of terminating immediately. These lock that both halves
// still carry the exit codes the CLI has always promised.
describe("exit codes survive the exitCode refactor", () => {
  it("0 on a command that succeeds (felag's own spec lints clean)", async () => {
    expect((await sh(`${cli} lint spec/felag-core`)).code).toBe(0);
  });

  it("2 on an unknown verb", async () => {
    const run = await sh(`${cli} frobnicate`);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("felag <lint|");
  });

  it("2 on a usage error mid-case (render missing --audience)", async () => {
    const run = await sh(`${cli} render spec/felag-core`);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("usage: felag render");
  });
});
