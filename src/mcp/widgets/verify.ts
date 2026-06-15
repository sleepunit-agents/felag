// felag "verify" (conformance report) widget registration — felag verifying
// itself (felag-ts against felag-core).
//
// structuredContent = the ConformanceReport from verify(), ENRICHED with the
// human layer the bare report omits. A ConformanceReport names criterion ids
// only (failing/waived/disputed/advisory). On its own that's a wall of opaque
// ids — exactly the anti-pattern this widget exists to avoid. So here we:
//   - join every report-mentioned criterion (and every GATING criterion, so a
//     clean "everything passes" report still has a rich body) back to the spec
//     for its itemId / gherkin / force / fixtures / contractId, and
//   - attach, per criterion, its EVIDENCE — the matching VerificationRecords
//     from the felag-ts ledger (verdict + evidence string + fixtureId + at) —
//     so a reader sees WHY a criterion passed/failed, not just which bucket.
// Items, fixtures, and governance history ride alongside (same pattern as the
// board widget) so the view can render titles, fixture descriptions, and the
// per-criterion governance lifecycle. See widgets/verify.widget.tsx for the view.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fixtureHash } from "../../canonical.js";
import { parseInstant } from "../../instant.js";
import type {
  Criterion,
  Fixture,
  Preamble,
  SpecRecord,
  VerificationRecord,
} from "../../records.js";
import { verify } from "../../verify.js";
import { registerWidget } from "./shared.js";
import { resolveProject } from "./projects.js";

/** One VerificationRecord, trimmed to the fields the view shows as evidence. */
interface EvidenceRecord {
  fixtureId?: string;
  verdict: VerificationRecord["verdict"];
  evidence: string;
  runner: string;
  at: string;
  attribution: string;
  stale: boolean; // fixtureHash present and != current canonical hash → ignored by D1
}

/** A report-mentioned (or gating) criterion, enriched for human reading. */
interface EnrichedCriterion {
  id: string;
  bucket: "failing" | "waived" | "disputed" | "passing" | "advisory";
  itemId: string;
  itemTitle: string;
  contractId?: string;
  contractDescription?: string;
  force: string;
  state: string;
  cls: string;
  gherkin: string; // readable Gherkin scenario (or the checklist item text)
  fixtures: string[]; // fixture ids
  evidence: EvidenceRecord[]; // matching VerificationRecords, newest first
}

/** Gating predicate, mirrored from verify.ts gates() so the view can show the
 * full set of criteria that DEFINE the verdict (not just the buckets, which are
 * empty for a conforming impl). */
function gates(c: Criterion, declared: Set<string>, implementation: string): boolean {
  if (c.force !== "MUST") return false;
  if (c.class === "judgment" && c.judgment === undefined) return false;
  if (c.contractId === undefined || !declared.has(c.contractId)) return false;
  if (c.state === "active") return true;
  if (c.state === "disputed") return c.dispute?.by !== implementation;
  return false;
}

function verifyModel(args: Record<string, unknown>): Record<string, unknown> {
  const p = resolveProject(args.project as string | undefined);
  const spec = p.spec as unknown as SpecRecord[];
  const records = (p.records ?? []) as VerificationRecord[];
  const asOf = new Date().toISOString();
  const implementation = p.implementation;

  const report = verify({
    asOf,
    implementation,
    records,
    spec: spec as SpecRecord[],
    waivers: [],
  });

  const preamble = spec.find((r) => r.record === "preamble") as Preamble | undefined;
  const conformanceVersion = preamble?.conformanceVersion ?? "";
  const declared = new Set((preamble?.contracts ?? []).map((c) => c.id));
  const contractDesc: Record<string, string> = {};
  for (const c of preamble?.contracts ?? []) contractDesc[c.id] = c.description;

  const items = p.items;
  const fixtures = p.fixtures;
  const criteria = spec.filter((r): r is Criterion => r.record === "criterion");
  const fixturesById = new Map(
    spec.filter((r): r is Fixture => r.record === "fixture").map((f) => [f.id, f]),
  );

  // Which bucket does a criterion fall in? Buckets are precedence-ordered so a
  // criterion is named once: failing > waived > disputed > advisory > passing.
  const failing = new Set(report.failing);
  const waived = new Set(report.waived);
  const disputed = new Set(report.disputed);
  const advisory = new Set(report.advisory.map((a) => a.criterionId));

  function bucketOf(c: Criterion, isGating: boolean): EnrichedCriterion["bucket"] | null {
    if (failing.has(c.id)) return "failing";
    if (waived.has(c.id)) return "waived";
    if (disputed.has(c.id)) return "disputed";
    if (advisory.has(c.id)) return "advisory";
    if (isGating) return "passing";
    return null; // non-gating, unmentioned — not part of the conformance story
  }

  // Pull the evidence (matching ledger records) for one criterion, newest
  // first, flagging stale-hash records the way verify's D1 does.
  function evidenceFor(c: Criterion): EvidenceRecord[] {
    return records
      .filter((r) => r.criterionId === c.id && r.implementation === implementation)
      .map((r) => {
        let stale = false;
        if (r.fixtureHash !== undefined && r.fixtureId) {
          const fx = fixturesById.get(r.fixtureId);
          if (fx && r.fixtureHash !== fixtureHash(fx)) stale = true;
        }
        return {
          fixtureId: r.fixtureId,
          verdict: r.verdict,
          evidence: r.evidence,
          runner: r.runner,
          at: r.at,
          attribution: r.attribution,
          stale,
        };
      })
      .sort((a, b) => {
        const ta = parseInstant(a.at);
        const tb = parseInstant(b.at);
        if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
        if (Number.isNaN(ta)) return 1;
        if (Number.isNaN(tb)) return -1;
        return tb - ta;
      });
  }

  const enriched: EnrichedCriterion[] = [];
  for (const c of criteria) {
    const isGating = gates(c, declared, implementation);
    const bucket = bucketOf(c, isGating);
    if (bucket === null) continue;
    enriched.push({
      id: c.id,
      bucket,
      itemId: c.itemId,
      itemTitle: items[c.itemId]?.title ?? c.itemId,
      contractId: c.contractId,
      contractDescription: c.contractId ? contractDesc[c.contractId] : undefined,
      force: c.force,
      state: c.state,
      cls: c.class,
      gherkin: c.gherkin ?? c.item ?? "",
      fixtures: c.fixtures ?? [],
      evidence: evidenceFor(c),
    });
  }

  // Verdict-defining headline counts. totalActive = gating criteria; passing =
  // gating that aren't failing/waived/disputed.
  const gatingCriteria = criteria.filter((c) => gates(c, declared, implementation));
  const totalActive = gatingCriteria.length;
  const passingCount = gatingCriteria.filter(
    (c) => !failing.has(c.id) && !waived.has(c.id) && !disputed.has(c.id),
  ).length;

  return {
    report,
    implementation,
    conformanceVersion,
    verifiedAt: asOf,
    criteria: enriched,
    contracts: preamble?.contracts ?? [],
    passingCount,
    totalActive,
    counts: {
      failing: report.failing.length,
      waived: report.waived.length,
      disputed: report.disputed.length,
      advisory: report.advisory.length,
    },
    items,
    fixtures,
    history: p.history,
    project: p.name,
  } as unknown as Record<string, unknown>;
}

export function registerVerifyWidget(server: McpServer): void {
  registerWidget(server, {
    tool: "felag_verify_view",
    uri: "ui://felag/verify",
    htmlFile: "verify.html",
    description:
      "Show the felag conformance report — felag-ts verified against felag-core — as a widget. " +
      "Inline = the verdict pill + N/N criteria passing + a counts strip (failing/waived/disputed). " +
      "Expand to fullscreen for the full report: every gating criterion grouped by contract, each card " +
      "showing its parent item title + readable Gherkin scenario, and click-to-drill into the scenario, " +
      "its fixtures (with descriptions), the EVIDENCE (the VerificationRecord verdict + evidence text + " +
      "fixture + timestamp that proves it passed/failed), and the criterion's governance history. " +
      "felag-core conforms today, so this reads as a satisfying green audit; failing/disputed lead in red.",
    structured: verifyModel,
  });
}
