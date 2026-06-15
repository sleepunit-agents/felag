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
import type { SpecRecord } from "../../records.js";
import { registerWidget } from "./shared.js";
import { resolveProject } from "./projects.js";

function boardModel(args: Record<string, unknown>): Record<string, unknown> {
  const p = resolveProject(args.project as string | undefined);
  const model = computeStatus(p.spec as unknown as SpecRecord[], {
    records: p.records,
    implementation: p.implementation,
    asOf: new Date().toISOString(),
  });
  return {
    ...model,
    project: p.name,
    items: p.items,
    fixtures: p.fixtures,
    history: p.history,
  } as unknown as Record<string, unknown>;
}

export function registerBoardWidget(server: McpServer): void {
  registerWidget(server, {
    tool: "felag_board",
    uri: "ui://felag/board",
    htmlFile: "board.html",
    description:
      "Show the felag board — a spec joined to its conformance, as a widget. Defaults to the active " +
      "project (felag-core: felag spec'ing itself); pass `project` to view any registered project. " +
      "Inline = the spec name + verdict + counts strip; expand to fullscreen for the full board: " +
      "criteria grouped by item under each contract, every card showing its readable Gherkin scenario, " +
      "and click-to-drill into a criterion's fixtures + full governance history (proposed → ratified, by whom). " +
      "A project with no conformance ledger renders with criteria shown unverified.",
    structured: boardModel,
  });
}
