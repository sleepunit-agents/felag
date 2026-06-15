// Project-management MCP tools — list / create / select / remove the projects
// the view widgets can show. Like the widgets, these are TRANSPORT/state (off
// the c-mcp contract, gated on FELAG_WIDGETS): they read and mutate the
// persisted registry in projects.ts. They are plain tools (no ui:// resource).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createProject,
  listProjects,
  removeProject,
  selectProject,
} from "./projects.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** Marshal a value (or a thrown error) into the standard tool envelope. */
function run(fn: () => unknown): ToolResult {
  try {
    return { content: [{ type: "text", text: JSON.stringify(fn(), null, 2) }] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: JSON.stringify({ error: msg }, null, 2) }], isError: true };
  }
}

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "felag_project_list",
    {
      description:
        "List the felag projects the view widgets can show — [{ name, specDir, description, builtin, " +
        "implementation?, active }]. The active project is what the zero-arg widgets render (default felag-core).",
      inputSchema: {},
    },
    async () => run(() => listProjects()),
  );

  server.registerTool(
    "felag_project_create",
    {
      description:
        "Register a felag project. With `specDir` (a dir holding spec.jsonl [+ fixtures.jsonl]) it adopts that " +
        "spec IN PLACE — files are never moved (e.g. point it at loom's spec). Without `specDir` it scaffolds an " +
        "empty valid spec under the managed projects root and registers that. Rejects duplicate or builtin names; " +
        "optionally carries a conformance ledger later. Returns the created entry (with any load warning).",
      inputSchema: {
        name: z.string().describe("unique project name (letters, digits, . _ -)"),
        specDir: z
          .string()
          .optional()
          .describe("existing spec dir to adopt in place; omit to scaffold an empty spec"),
        description: z.string().optional().describe("human description"),
      },
    },
    async (a: { name: string; specDir?: string; description?: string }) =>
      run(() => createProject(a.name, a.specDir, a.description)),
  );

  server.registerTool(
    "felag_project_select",
    {
      description:
        "Set the active felag project by name — the project the zero-arg view widgets (felag_board, felag_verify_view, " +
        "etc.) render from then on. Errors on an unknown name. Returns the new active entry.",
      inputSchema: { name: z.string().describe("project name to make active") },
    },
    async (a: { name: string }) => run(() => selectProject(a.name)),
  );

  server.registerTool(
    "felag_project_remove",
    {
      description:
        "Deregister a felag project by name. Refuses the builtin (felag-core). Never deletes spec files on disk — " +
        "deregisters only. If the removed project was active, the active selection falls back to felag-core.",
      inputSchema: { name: z.string().describe("project name to deregister") },
    },
    async (a: { name: string }) => run(() => removeProject(a.name)),
  );
}
