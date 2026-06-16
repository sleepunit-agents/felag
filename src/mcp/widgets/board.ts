// felag "board" widget registration — the spec ⋈ conformance board.
//
// structuredContent = the resolved project's StatusModel (spec-state ⋈ its
// conformance ledger), ENRICHED with the human layer the bare StatusModel omits:
// the parent items (title + body), the fixtures (description + format), and the
// governance history per criterion. computeStatus stays the contracted view;
// these extras ride alongside it (never through model context). The project is
// resolved from the call's `project` arg → active project → felag-core, so the
// board shows felag-core by default but any registered project on request. A
// spec-only project (no conformance ledger) renders unverified, not an error.
// See widgets/board.widget.tsx for the view.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { computeStatus } from "../../status.js";
import type { Preamble, SpecRecord } from "../../records.js";
import { registerWidget } from "./shared.js";
import { resolveProductClosure, resolveProject } from "./projects.js";

function boardModel(args: Record<string, unknown>): Record<string, unknown> {
  const p = resolveProject(args.project as string | undefined);
  const model = computeStatus(p.spec as unknown as SpecRecord[], {
    records: p.records,
    implementation: p.implementation,
    asOf: new Date().toISOString(),
  });

  // Product tier: the spec's IMMEDIATE `requires` (its direct members), each
  // enriched with the verdict the closure resolved for it. Empty ⇒ a leaf spec
  // (today's board). Drilling into a member re-invokes felag_board(project=member),
  // so the view is recursive: product → members → (each member's own board).
  const preamble = (p.spec as unknown as SpecRecord[]).find(
    (r): r is Preamble => r.record === "preamble",
  );
  const closure = resolveProductClosure(p.name);
  const verdictBySpec = new Map(closure.members.map((m) => [m.spec, m]));
  const members = (preamble?.requires ?? []).map((req) => {
    const m = verdictBySpec.get(req.spec);
    return {
      spec: req.spec,
      version: req.version,
      verdict: m?.verdict ?? "unverified",
      description: m?.description ?? "",
      role: m?.role ?? "module",
    };
  });

  return {
    ...model,
    project: p.name,
    items: p.items,
    fixtures: p.fixtures,
    history: p.history,
    members,
    isProduct: members.length > 0,
    productVerdict: closure.verdict,
    closureErrors: closure.errors,
  } as unknown as Record<string, unknown>;
}

export function registerBoardWidget(server: McpServer): void {
  registerWidget(server, {
    tool: "felag_board",
    uri: "ui://felag/board",
    htmlFile: "board.html",
    description:
      "Show the felag board — a spec joined to its conformance, as a widget. Defaults to the active " +
      "project; pass `project` to view any registered spec or product. RECURSIVE: a product (a spec that " +
      "`requires` others) shows a product tier — its pieces as cards (name@version + rolled-up verdict), each " +
      "drillable into its own board; a leaf spec shows the full board (criteria grouped by item under each " +
      "contract, each card its readable Gherkin scenario, click-to-drill into fixtures + governance history). " +
      "A product conforms only when every piece does; a piece with no conformance ledger reads unverified.",
    structured: boardModel,
  });
}
