// felag "review queue" widget registration — the governance / HITL surface.
//
// The review queue is the human-in-the-loop ratification surface: every
// criterion whose state is `proposed` (awaiting ratification) or `disputed`
// (awaiting resolution) waits here for a human to sign it. felag governance is
// NOT mutated by a button — a button DRAFTS a plain-English instruction
// (`felag: ratify ac-foo as active`) that the human sends; the human sending it
// IS the governance act. So the structuredContent carries the pending criteria
// (human-friendly: parent item title, readable Gherkin, fixtures) plus the
// governance LEDGER so the widget is always informative even when the queue is
// clear — which, for an all-active felag-core, it currently is.
//
// Self-referential on felag-core, like board.ts. See
// widgets/review-queue.widget.tsx for the view.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { computeStatus } from "../../status.js";
import type { CritView } from "../../status.js";
import type { SpecRecord, VerificationRecord } from "../../records.js";
import { registerWidget } from "./shared.js";
import type { HistoryEntry } from "./shared.js";
import { resolveProject } from "./projects.js";

/** A flattened governance act, enriched with the human "what" so the ledger
 * reads without cross-referencing: the criterion's parent item title + the
 * to-state + outcome + who. Newest first. */
interface RecentAct extends HistoryEntry {
  critId: string;
  itemId?: string;
  itemTitle?: string;
}

function reviewQueueModel(args: Record<string, unknown>): Record<string, unknown> {
  const p = resolveProject(args.project as string | undefined);
  const spec = p.spec;
  const records = p.records as VerificationRecord[] | undefined;
  const model = computeStatus(spec as unknown as SpecRecord[], {
    records,
    implementation: p.implementation,
    asOf: new Date().toISOString(),
  });

  // The queue = every criterion across contracts whose state needs a human:
  // proposed (awaiting ratification) or disputed (awaiting resolution).
  const pending: CritView[] = model.contracts
    .flatMap((ct) => ct.criteria)
    .filter((c) => c.status === "proposed" || c.status === "disputed");

  const items = p.items;
  const history = p.history;

  // Flatten the per-criterion histories into one ledger, enrich with the parent
  // item title, sort newest-first, cap at 20. Built server-side so the empty
  // state (no pending) still has a rich, simple-to-render governance log.
  const critToItem: Record<string, string> = {};
  for (const ct of model.contracts) {
    for (const c of ct.criteria) critToItem[c.id] = c.itemId;
  }
  const recent: RecentAct[] = Object.entries(history)
    .flatMap(([critId, entries]) =>
      entries.map((e) => {
        const itemId = critToItem[critId];
        return {
          ...e,
          critId,
          itemId,
          itemTitle: itemId ? items[itemId]?.title : undefined,
        };
      }),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);

  return {
    name: model.name,
    version: model.version,
    project: p.name,
    pending,
    items,
    fixtures: p.fixtures,
    history,
    recent,
  } as unknown as Record<string, unknown>;
}

export function registerReviewQueueWidget(server: McpServer): void {
  registerWidget(server, {
    tool: "felag_review_queue",
    uri: "ui://felag/review-queue",
    htmlFile: "review-queue.html",
    description:
      "Show the felag review queue — the human-in-the-loop governance surface. " +
      "Inline = how many criteria await review (or 'queue clear') plus the first one or two. " +
      "Expand to fullscreen for the full queue: each proposed/disputed criterion as a governance card " +
      "(parent item title + readable Gherkin + force), click-to-drill into its item body, fixtures, and " +
      "full governance history, with action buttons that DRAFT the plain-English ratify / make-descriptive / " +
      "dispute instruction for a human to send (the click never mutates state). When the queue is clear, " +
      "the view becomes the recent governance activity log — the ledger of who ratified what, when.",
    structured: reviewQueueModel,
  });
}
