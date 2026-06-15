// felag MCP-App widget registry (env-gated: FELAG_WIDGETS).
//
// One call site for every live widget. Each widget is a self-contained module
// that registers its ui:// resource + tool via ./shared.ts. To add a widget:
// write widgets/<name>.widget.tsx (the view) + ./<name>.ts (register fn), add a
// build entry in scripts/build-widgets.mjs, and one line here.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBoardWidget } from "./board.js";
import { registerAuditWidget } from "./audit.js";
import { registerReviewQueueWidget } from "./review-queue.js";
import { registerVerifyWidget } from "./verify.js";
import { registerRenderWidget } from "./render.js";
import { registerLintWidget } from "./lint.js";

export function registerWidgets(server: McpServer): void {
  registerBoardWidget(server);
  registerAuditWidget(server);
  registerReviewQueueWidget(server);
  registerVerifyWidget(server);
  registerRenderWidget(server);
  registerLintWidget(server);
}
