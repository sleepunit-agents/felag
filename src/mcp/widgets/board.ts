// felag "board" widget registration — felag spec'ing itself.
//
// structuredContent = the felag-core StatusModel (spec-state ⋈ felag-ts
// conformance), ENRICHED with the human layer the bare StatusModel omits: the
// parent items (title + body), the fixtures (description + format), and the
// governance history per criterion. computeStatus stays the contracted view;
// these extras ride alongside it (never through model context). See
// widgets/board.widget.tsx for the view.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { computeStatus } from "../../status.js";
import type { VerificationRecord } from "../../records.js";
import {
  coreFixtures,
  coreItems,
  coreRecords,
  coreSpec,
  governanceHistory,
  registerWidget,
} from "./shared.js";

function boardModel(): Record<string, unknown> {
  const spec = coreSpec();
  const records = coreRecords() as VerificationRecord[] | undefined;
  const model = computeStatus(spec as never, {
    records,
    implementation: "felag-ts",
    asOf: new Date().toISOString(),
  });
  return {
    ...model,
    items: coreItems(),
    fixtures: coreFixtures(),
    history: governanceHistory(),
  } as unknown as Record<string, unknown>;
}

export function registerBoardWidget(server: McpServer): void {
  registerWidget(server, {
    tool: "felag_board",
    uri: "ui://felag/board",
    htmlFile: "board.html",
    description:
      "Show the felag board — felag's own spec joined to its conformance, as a widget. " +
      "Inline = the spec name + verdict + counts strip; expand to fullscreen for the full board: " +
      "criteria grouped by item under each contract, every card showing its readable Gherkin scenario, " +
      "and click-to-drill into a criterion's fixtures + full governance history (proposed → ratified, by whom).",
    structured: boardModel,
  });
}
