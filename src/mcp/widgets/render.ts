// felag "render" widget registration — felag's audience-projection verb as a
// readable inventory.
//
// `render` produces a DIFFERENT content inventory per audience (stakeholder /
// developer / verifier): which records are included, which fields are projected
// out, and — for the verifier — which fixtures declare a projection that MODELS
// the impl. The bare RenderInventory is sets of opaque record ids, which tells a
// reader nothing about WHAT each audience sees. So this module (1) computes all
// THREE audiences up front (the widget toggles between them with no server
// round-trip) and (2) ENRICHES every included id with its human content via a
// recordIndex built from coreSpec() + coreFixtures(): an item resolves to its
// title+body, a criterion to its Gherkin+force, a fixture to its
// description+format. Self-referential on felag-core, exactly like board.ts. See
// widgets/render.widget.tsx for the view.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { renderInventory } from "../../author.js";
import type { Criterion, Fixture, Item, SpecRecord } from "../../records.js";
import { registerWidget } from "./shared.js";
import { resolveProject } from "./projects.js";

const AUDIENCES = ["stakeholder", "developer", "verifier"] as const;

/** A resolved record: the human meaning behind an included id. kind drives how
 * the view renders it; the optional fields carry that kind's content. */
interface RecordMeta {
  kind: "item" | "criterion" | "fixture" | "preamble";
  title?: string; // item title / fixture description (the readable label)
  body?: string; // item body
  gherkin?: string; // criterion scenario
  force?: string; // criterion force (MUST/SHOULD/MAY)
  state?: string; // criterion state (active/deprecated/…)
  itemId?: string; // criterion's parent item (grouping key)
  description?: string; // fixture description
  format?: string; // fixture format
  projection?: string; // fixture projection note (models-the-impl), if any
}

function renderModel(args: Record<string, unknown>): Record<string, unknown> {
  const p = resolveProject(args.project as string | undefined);
  const spec = p.spec;

  // All three audiences, computed once — the view toggles instantly.
  const audiences = AUDIENCES.map((a) => {
    const inv = renderInventory({ spec: spec as unknown as SpecRecord[], audience: a });
    return {
      audience: a,
      included: inv.included,
      excludedFields: inv.excludedFields,
      projections: inv.projections,
    };
  });

  // recordIndex: every id any audience can include resolves to its human
  // content. Built from the full spec + fixtures so no included id is ever bare.
  const recordIndex: Record<string, RecordMeta> = {};
  for (const rec of spec as unknown as SpecRecord[]) {
    if (rec.record === "item") {
      const i = rec as Item;
      recordIndex[i.id] = { kind: "item", title: i.title || i.id, body: i.body ?? "" };
    } else if (rec.record === "criterion") {
      const c = rec as Criterion;
      recordIndex[c.id] = {
        kind: "criterion",
        gherkin: c.gherkin ?? c.item ?? "",
        force: c.force ?? "",
        state: c.state ?? "",
        itemId: c.itemId ?? "",
      };
    } else if (rec.record === "fixture") {
      const f = rec as Fixture;
      recordIndex[f.id] = {
        kind: "fixture",
        description: f.description ?? "",
        format: f.format ?? "",
        ...(typeof f.projection === "string" ? { projection: f.projection } : {}),
      };
    }
  }

  return {
    project: p.name,
    spec: p.name,
    audiences,
    recordIndex,
    items: p.items,
    fixtures: p.fixtures,
  } as unknown as Record<string, unknown>;
}

export function registerRenderWidget(server: McpServer): void {
  registerWidget(server, {
    tool: "felag_render_view",
    uri: "ui://felag/render",
    htmlFile: "render.html",
    description:
      "Show the felag render — felag's own spec projected for an audience, as a widget. " +
      "render produces a different content inventory per audience (stakeholder / developer / verifier): " +
      "which records are included, which fields are hidden, and — for the verifier — which fixtures' format " +
      "models the impl (projections to audit). Inline = the current audience + how many records it includes; " +
      "expand to fullscreen for the audience switcher and the included records as a readable list grouped by " +
      "item (each shown by its human title / Gherkin / description, click-to-drill its detail), plus the " +
      "hidden-fields chips. Switching audience updates the view live — all three are carried in one payload.",
    structured: renderModel,
  });
}
