// felag "audit" widget registration — felag's coverage verb as a work board.
//
// structuredContent = the AuditResult of running `audit` on felag-core against
// the felag-ts ledger (self-referential, exactly like board.ts), ENRICHED so
// the view is human-readable rather than a wall of ids. audit's proposals carry
// only (specItemRef, criterionId); the bare criterion id tells a reader
// nothing. So we join each proposal onto the criterion it concerns — its parent
// itemId, its readable Gherkin scenario, and its fixtures — and ship the items /
// fixtures / governance-history maps alongside. felag-core currently CONFORMS,
// so proposals is typically EMPTY: the widget then reads as a healthy work board
// (verdict + counts + recent governance log), never a void. See
// widgets/audit.widget.tsx for the view.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { audit } from "../../audit.js";
import type {
  Criterion,
  SpecRecord,
  VerificationRecord,
} from "../../records.js";
import { registerWidget } from "./shared.js";
import { resolveProject } from "./projects.js";

function auditModel(args: Record<string, unknown>): Record<string, unknown> {
  const p = resolveProject(args.project as string | undefined);
  const spec = p.spec;
  const records = (p.records ?? []) as VerificationRecord[];
  const result = audit({
    asOf: new Date().toISOString(),
    implementation: p.implementation,
    records,
    spec: spec as unknown as SpecRecord[],
    waivers: [],
  });

  // critId → { itemId, gherkin, fixtures } from the spec's criterion records —
  // the human content audit's proposals omit.
  const critIndex: Record<string, { itemId: string; gherkin: string; fixtures: string[] }> = {};
  for (const rec of spec as unknown as Criterion[]) {
    if (rec.record === "criterion" && rec.id) {
      critIndex[rec.id] = {
        itemId: rec.itemId ?? "",
        gherkin: rec.gherkin ?? "",
        fixtures: rec.fixtures ?? [],
      };
    }
  }

  // Join the human "what" onto each proposal so the view never shows a bare id.
  const proposals = result.proposals.map((p) => {
    const x = critIndex[p.criterionId ?? ""] ?? { itemId: "", gherkin: "", fixtures: [] };
    return {
      ...p,
      itemId: x.itemId,
      gherkin: x.gherkin,
      fixtures: x.fixtures,
    };
  });

  return {
    report: result.report,
    proposals,
    project: p.name,
    items: p.items,
    fixtures: p.fixtures,
    history: p.history,
  } as unknown as Record<string, unknown>;
}

export function registerAuditWidget(server: McpServer): void {
  registerWidget(server, {
    tool: "felag_audit_view",
    uri: "ui://felag/audit",
    htmlFile: "audit.html",
    description:
      "Show the felag audit — felag's own conformance turned into a work board, as a widget. " +
      "One work card per failing gating criterion (the human title, the criterion's parent item + " +
      "readable Gherkin, why it's failing, its fixtures, and click-to-drill its governance history). " +
      "Inline = verdict + open-work count + top titles; expand to fullscreen for the full plan. " +
      "When felag-core conforms (0 open work), the fullscreen view stays informative: the conformance " +
      "verdict + counts plus a recent-governance-activity log (newest ratifications first).",
    structured: auditModel,
  });
}
