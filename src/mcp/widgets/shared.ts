// Shared plumbing for the felag MCP-App widgets (env-gated: FELAG_WIDGETS).
//
// These widgets are TRANSPORT/PRESENTATION — off the c-mcp contract, off the
// default tool surface — so they can't disturb the contracted verbs or their
// tests. Each widget is a small self-contained module under this directory that
// (1) bundles a Preact view into dist/widgets/<name>.html (build-widgets.mjs)
// and (2) registers a ui:// resource + a tool whose structuredContent carries
// the view's model. This module is the common floor every widget builds on:
// repo-root resolution, the governance-history reader, and the generic
// registrar. Per-project spec/fixtures/items/records loading lives in
// projects.ts (resolveProject).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z, type ZodRawShape } from "zod";

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
export function governanceHistory(govDir: string): Record<string, HistoryEntry[]> {
  if (!existsSync(govDir)) return {};
  const out: Record<string, HistoryEntry[]> = {};
  for (const f of readdirSync(govDir)) {
    if (!f.endsWith(".transition.json")) continue;
    try {
      const t = JSON.parse(readFileSync(join(govDir, f), "utf8"));
      const rPath = join(govDir, f.replace(/\.transition\.json$/, ".result.json"));
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
  /** Tool inputSchema. Defaults to the project selector (an optional `project`
   * name) — the override that lets a widget look at any registered project. */
  inputSchema?: ZodRawShape;
  /** Build the structuredContent the widget renders, given the call's arguments
   * (e.g. `{ project }`). Called per tool invocation so a refresh re-reads disk.
   * Throwing is caught and surfaced as an error envelope, not a crash. */
  structured: (args: Record<string, unknown>) => Record<string, unknown>;
}

/** The default widget input: an optional project override. Omitted → the active
 * project (default felag-core), so existing zero-arg calls are unchanged. */
const PROJECT_INPUT: ZodRawShape = {
  project: z
    .string()
    .optional()
    .describe("project name to view; omit for the active project (default felag-core)"),
};

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
      inputSchema: w.inputSchema ?? PROJECT_INPUT,
      _meta: { ui: { resourceUri: w.uri, visibility: ["model", "app"] } },
    },
    async (args: Record<string, unknown>) => {
      try {
        return {
          content: [{ type: "text" as const, text: `${w.tool} — see the rendered widget.` }],
          structuredContent: w.structured(args ?? {}),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: `${w.tool} error: ${msg}` }],
          structuredContent: { error: msg },
        };
      }
    },
  );
}
