// felag MCP server — the stdio transport binding over the pure dispatch core.
//
// This layer is TRANSPORT: it is deliberately NOT part of the c-mcp contract
// (spec/felag-mcp excludes the SDK wiring, the tool inputSchemas, and disk I/O,
// exactly as felag-core excludes CLI output formatting). Its whole job is to
// (1) read a requested specDir from disk into the path->content snapshot the
// pure function expects, (2) supply a wall-clock asOf for the time-taking verbs,
// and (3) marshal the result envelope into MCP content. All semantics live in
// mcpDispatch.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z, type ZodRawShape } from "zod";
import { mcpDispatch, type FsSnapshot } from "./dispatch.js";
import { parse } from "../canonical.js";
import { computeStatus } from "../status.js";

const SPEC_FILES = ["spec.jsonl", "fixtures.jsonl"];

/** Build the filesystem snapshot the pure dispatcher reads: the two interchange
 * files under the requested specDir, keyed exactly as dispatch joins them
 * ("dir/file"). Absent files are simply omitted — dispatch maps "neither
 * present" to E_SPEC_NOT_FOUND. This is the only disk read in the whole server,
 * and it is transport. */
function snapshot(specDir: unknown): FsSnapshot {
  const fs: FsSnapshot = {};
  if (typeof specDir !== "string") return fs;
  for (const file of SPEC_FILES) {
    const path = `${specDir}/${file}`;
    try {
      fs[path] = readFileSync(path, "utf8");
    } catch {
      // absent — leave it out of the snapshot.
    }
  }
  return fs;
}

// Reusable field schemas. These are advisory ergonomics for hosts, NOT contract
// (spec/felag-mcp excludes the inputSchemas); they describe the shape an agent
// fills, and dispatch is the authority on behavior.
const f = {
  spec: z.array(z.unknown()).optional().describe("inline spec (SpecRecord[]); wins over specDir"),
  specDir: z.string().optional().describe("directory holding spec.jsonl + fixtures.jsonl"),
  records: z.array(z.unknown()).optional(),
  implementation: z.string().describe("implementation name under evaluation"),
  asOf: z.string().optional().describe("ISO instant; defaults to now"),
  waivers: z.array(z.unknown()).optional(),
  judgmentRecords: z.array(z.unknown()).optional(),
};

interface ToolDef {
  name: string;
  description: string;
  shape: ZodRawShape;
  /** Verbs that take a clock: the server fills asOf=now when the caller omits it. */
  clock?: boolean;
}

const TOOLS: ToolDef[] = [
  { name: "felag_lint", description: "Lint a spec; returns {valid, errors, orphanFixtures}.", shape: { spec: f.spec, specDir: f.specDir } },
  { name: "felag_fmt", description: "Canonicalize records or raw jsonl text; returns {canonical}. Read-only.", shape: { records: f.records, text: z.string().optional() } },
  { name: "felag_hash", description: "Fixture hashes; returns {hashes:[{id,hash}]}.", shape: { spec: f.spec, specDir: f.specDir, fixtureId: z.string().optional() } },
  { name: "felag_verify", description: "Derive a conformance report from VerificationRecords.", shape: { spec: f.spec, specDir: f.specDir, records: f.records, implementation: f.implementation, asOf: f.asOf, waivers: f.waivers, judgmentRecords: f.judgmentRecords }, clock: true },
  { name: "felag_audit", description: "Conformance report plus coverage task proposals (no work layer).", shape: { spec: f.spec, specDir: f.specDir, records: f.records, implementation: f.implementation, asOf: f.asOf, waivers: f.waivers, judgmentRecords: f.judgmentRecords }, clock: true },
  { name: "felag_promote", description: "Evaluate a promotion transition (ratification as a total function).", shape: { spec: f.spec, specDir: f.specDir, transition: z.record(z.string(), z.unknown()), asOf: f.asOf }, clock: true },
  { name: "felag_graduate", description: "Graduate a judgment criterion from JudgmentRecords.", shape: { spec: f.spec, specDir: f.specDir, records: f.records, implementation: f.implementation, criterionId: z.string() } },
  { name: "felag_render", description: "Audience content inventory; returns {included, excludedFields, projections}.", shape: { spec: f.spec, specDir: f.specDir, audience: z.enum(["stakeholder", "developer", "verifier"]) } },
  { name: "felag_prime", description: "Emit the author-class protocol brief (markdown string).", shape: { spec: f.spec, specDir: f.specDir } },
  { name: "felag_validate_author", description: "Validate authored output (lint + budgets + provenance).", shape: { spec: f.spec, specDir: f.specDir, new: z.array(z.string()).optional(), budgets: z.record(z.string(), z.unknown()).optional() } },
  { name: "felag_validate_excavate", description: "Validate excavate output (scoped, discovered+proposed).", shape: { spec: f.spec, specDir: f.specDir, scope: z.record(z.string(), z.unknown()).nullable().optional() } },
  { name: "felag_validate_prime", description: "Validate a prime document carries the protocol bodies verbatim.", shape: { spec: f.spec, specDir: f.specDir, output: z.string() } },
  // Presentation tool (outside the c-mcp contract; see dispatch's PRESENTATION_HANDLERS).
  { name: "felag_status", description: "Status projection (spec-state ⋈ verify); returns {model, html}. Optional records/implementation/asOf join conformance; target selects a contract or criterion.", shape: { spec: f.spec, specDir: f.specDir, records: f.records, implementation: z.string().optional().describe("implementation name; omit for a spec-only view"), asOf: f.asOf, waivers: f.waivers, target: z.string().optional().describe("contract id → section; criterion id → detail; absent → whole spec") } },
];

// ---- MCP-App widgets (env-gated: FELAG_WIDGETS) ----
//
// The "board" widget renders felag's own StatusModel — felag spec'ing itself.
// This is TRANSPORT/PRESENTATION, off the default surface (so it can't disturb
// existing tests/smoke): the widget tool + ui:// resource register only when
// process.env.FELAG_WIDGETS is set. The bundled HTML rides in the resource,
// never through model context; structuredContent carries the StatusModel.

/** Walk up from this module until a dir holding both spec/felag-core and the
 * dist/widgets bundle is found — robust to running from src (tsx) or dist. */
function resolveRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "spec", "felag-core", "spec.jsonl"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** felag's own status: felag-core spec ⋈ the felag-ts conformance records. If
 * the verification records are absent, fall back to a spec-only (unverified)
 * view — computeStatus accepts no records and derives "unverified". */
function boardModel(): Record<string, unknown> {
  const root = resolveRepoRoot();
  const spec = parse(readFileSync(join(root, "spec", "felag-core", "spec.jsonl"), "utf8"));
  const recPath = join(root, "verification", "felag-ts.records.jsonl");
  const records = existsSync(recPath)
    ? (parse(readFileSync(recPath, "utf8")) as never[])
    : undefined;
  return computeStatus(spec, {
    records,
    implementation: "felag-ts",
    asOf: new Date().toISOString(),
  }) as unknown as Record<string, unknown>;
}

/** Register the felag_board MCP-App tool + its ui://felag/board resource. */
function registerBoardWidget(server: McpServer): void {
  const html = readFileSync(
    join(resolveRepoRoot(), "dist", "widgets", "board.html"),
    "utf-8",
  );
  const uri = "ui://felag/board";
  const description =
    "Show the felag board — felag's own spec joined to its conformance, as a widget. " +
    "Inline = the spec name + verdict + counts strip; expand to fullscreen for the full board (criterion cards per contract).";
  registerAppResource(
    server,
    "felag_board-ui",
    uri,
    { description },
    async (u: URL) => ({
      contents: [{ uri: u.href, mimeType: RESOURCE_MIME_TYPE, text: html }],
    }),
  );
  registerAppTool(
    server,
    "felag_board",
    {
      description,
      inputSchema: {},
      _meta: { ui: { resourceUri: uri, visibility: ["model", "app"] } },
    },
    async () => ({
      content: [{ type: "text" as const, text: "felag_board — see the rendered board widget." }],
      structuredContent: boardModel(),
    }),
  );
}

/** Construct the felag MCP server with the twelve contracted verb tools plus the
 * felag_status presentation tool registered. The handler for every tool is the
 * same shape: snapshot the specDir, default the clock, dispatch, marshal.
 * When FELAG_WIDGETS is set, the env-gated felag_board MCP-App widget is also
 * registered (off the default surface otherwise). */
export function createServer(): McpServer {
  const server = new McpServer({ name: "felag-mcp", version: "0.1.0" });

  if (process.env.FELAG_WIDGETS) registerBoardWidget(server);

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.shape },
      async (args: Record<string, unknown>) => {
        const input = { ...args };
        if (tool.clock && input.asOf === undefined) input.asOf = new Date().toISOString();
        const envelope = mcpDispatch({ tool: tool.name, input }, snapshot(input.specDir));
        if (envelope.ok) {
          // A string result (felag_prime's markdown) is emitted raw; structured
          // results are pretty-printed JSON.
          const text =
            typeof envelope.result === "string"
              ? envelope.result
              : JSON.stringify(envelope.result, null, 2);
          return { content: [{ type: "text" as const, text }] };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: envelope.error, detail: envelope.detail }, null, 2) }],
          isError: true,
        };
      },
    );
  }

  return server;
}
