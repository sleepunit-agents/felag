// Shared plumbing for the felag MCP-App widgets (env-gated: FELAG_WIDGETS).
//
// These widgets are TRANSPORT/PRESENTATION — off the c-mcp contract, off the
// default tool surface — so they can't disturb the contracted verbs or their
// tests. Each widget is a small self-contained module under this directory that
// (1) bundles a Preact view into dist/widgets/<name>.html (build-widgets.mjs)
// and (2) registers a ui:// resource + a tool whose structuredContent carries
// the view's model. This module is the common floor every widget builds on:
// repo-root resolution, the felag-core spec/fixtures/items loaders, the
// governance-history reader, and the generic registrar.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { parse } from "../../canonical.js";

/** Walk up from this module until a dir holding the felag-core spec (and, in a
 * built tree, the dist/widgets bundle) is found — robust to running from src
 * (tsx) or dist. */
export function resolveRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "spec", "felag-core", "spec.jsonl"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Path to a file under the felag-core interchange dir. */
export function corePath(...parts: string[]): string {
  return join(resolveRepoRoot(), "spec", "felag-core", ...parts);
}

/** Parse felag-core's spec.jsonl (preamble + items + criteria). */
export function coreSpec(): Record<string, unknown>[] {
  return parse(readFileSync(corePath("spec.jsonl"), "utf8")) as unknown as Record<string, unknown>[];
}

/** Parse felag-core's fixtures.jsonl, keyed by id → {description, format}. */
export function coreFixtures(): Record<string, { description: string; format: string }> {
  const out: Record<string, { description: string; format: string }> = {};
  const p = corePath("fixtures.jsonl");
  if (!existsSync(p)) return out;
  for (const rec of parse(readFileSync(p, "utf8")) as { record: string; id?: string; description?: string; format?: string }[]) {
    if (rec.record === "fixture" && rec.id) out[rec.id] = { description: rec.description ?? "", format: rec.format ?? "" };
  }
  return out;
}

/** felag-core's items keyed by id → {title, body} — the human "what" each
 * criterion belongs to. */
export function coreItems(): Record<string, { title: string; body: string }> {
  const out: Record<string, { title: string; body: string }> = {};
  for (const rec of coreSpec() as { record: string; id?: string; title?: string; body?: string }[]) {
    if (rec.record === "item" && rec.id) out[rec.id] = { title: rec.title ?? rec.id, body: rec.body ?? "" };
  }
  return out;
}

/** felag-core's verification records (felag-ts conformance ledger), or undefined
 * if the ledger is absent — callers then derive an unverified view. */
export function coreRecords(): unknown[] | undefined {
  const p = join(resolveRepoRoot(), "verification", "felag-ts.records.jsonl");
  return existsSync(p) ? (parse(readFileSync(p, "utf8")) as unknown[]) : undefined;
}

export interface HistoryEntry {
  at: string;
  to: string;
  requestedBy: string;
  accepted: boolean;
  outcome: string;
  acks: { implementer: string; decision: string }[];
}

/** Read the governance ledger as a per-criterion history. Each governance act is
 * a triplet on disk — <date>-<critId>.{transition,result}.json. We pair the
 * transition (who requested what state, with whose acks) to its result (was it
 * ratified / lapsed / disputed) and group by criterion, oldest first. This is
 * the "review historical info" surface: a criterion's whole lifecycle. */
export function governanceHistory(root: string = resolveRepoRoot()): Record<string, HistoryEntry[]> {
  const dir = join(root, "governance");
  if (!existsSync(dir)) return {};
  const out: Record<string, HistoryEntry[]> = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".transition.json")) continue;
    try {
      const t = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const rPath = join(dir, f.replace(/\.transition\.json$/, ".result.json"));
      const r = existsSync(rPath) ? JSON.parse(readFileSync(rPath, "utf8")) : {};
      const id: string = t.criterionId;
      if (!id) continue;
      (out[id] ??= []).push({
        at: t.requestedAt ?? "",
        to: t.to ?? "",
        requestedBy: t.requestedBy ?? "",
        accepted: r.accepted === true,
        outcome: r.outcome ?? (r.accepted === true ? "ratified" : "rejected"),
        acks: Array.isArray(t.acknowledgments)
          ? t.acknowledgments.map((a: { implementer?: string; decision?: string }) => ({
              implementer: a.implementer ?? "?",
              decision: a.decision ?? "?",
            }))
          : [],
      });
    } catch {
      /* a malformed governance file shouldn't blank the whole widget */
    }
  }
  for (const id of Object.keys(out)) out[id].sort((a, b) => a.at.localeCompare(b.at));
  return out;
}

export interface WidgetSpec {
  tool: string;        // MCP tool name, e.g. "felag_audit"
  uri: string;         // ui:// resource uri, e.g. "ui://felag/audit"
  htmlFile: string;    // bundle under dist/widgets/, e.g. "audit.html"
  description: string; // shown to the model + as the resource description
  /** Build the structuredContent the widget renders. Called per tool invocation
   * so a refresh re-reads disk. Throwing yields an error envelope, not a crash. */
  structured: () => Record<string, unknown>;
}

/** Register one MCP-App widget: its ui:// resource (carrying the bundled HTML)
 * and its tool (whose structuredContent carries the model). The HTML bundle is
 * read once at registration; the model is computed per call. */
export function registerWidget(server: McpServer, w: WidgetSpec): void {
  const html = readFileSync(join(resolveRepoRoot(), "dist", "widgets", w.htmlFile), "utf-8");
  registerAppResource(
    server,
    `${w.tool}-ui`,
    w.uri,
    { description: w.description },
    async (u: URL) => ({
      contents: [{ uri: u.href, mimeType: RESOURCE_MIME_TYPE, text: html }],
    }),
  );
  registerAppTool(
    server,
    w.tool,
    {
      description: w.description,
      inputSchema: {},
      _meta: { ui: { resourceUri: w.uri, visibility: ["model", "app"] } },
    },
    async () => ({
      content: [{ type: "text" as const, text: `${w.tool} — see the rendered widget.` }],
      structuredContent: w.structured(),
    }),
  );
}
