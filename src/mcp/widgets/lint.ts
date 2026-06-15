// felag "lint" widget registration — felag's merge gate, made human-readable.
//
// structuredContent = the LintResult of running `lint` on felag-core (the full
// spec: spec.jsonl + fixtures.jsonl concatenated, exactly as resolveSpec does —
// lint MUST see the fixture records or it flags every reference E_UNKNOWN_FIXTURE),
// ENRICHED so the view never shows a bare {code, ref}:
//   - each error carries a HUMAN explanation of what its code MEANS and what to
//     fix (ported from the lint codebook), plus the OFFENDING RECORD resolved to
//     its human content (item title / criterion gherkin / fixture description);
//   - orphan fixtures (committed fixtures referenced by no criterion — a WARNING,
//     not a gate failure; not part of LintResult, computed here like dispatch.ts)
//     carry their description + format + the contract they dangle from;
//   - the items / fixtures / governance-history maps ride alongside for drill-down.
// felag-core is well-formed today, so this typically reads as a PASSED INSPECTION
// (0 errors, 0 orphans, every fixture resolves) rather than a void — the view
// affirms the clean bill of health richly. See widgets/lint.widget.tsx.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { lint } from "../../lint.js";
import type {
  Criterion,
  Fixture,
  Item,
  Preamble,
  SpecRecord,
} from "../../records.js";
import { registerWidget } from "./shared.js";
import { resolveProject } from "./projects.js";

// The lint codebook, as humans. Each code → what it MEANS (one line) and how to
// FIX it. Ported from src/lint.ts's semantics + the felag-lint skill prose, so a
// reader never has to decode "E_MISSING_FIXTURES" in their head.
const CODE_BOOK: Record<string, { title: string; meaning: string; fix: string }> = {
  E_SCHEMA: {
    title: "Malformed record",
    meaning:
      "A record doesn't match its shape — a required field is missing, the wrong type, or an unknown record kind.",
    fix: "Fix the offending record's fields to match the felag schema (preamble / item / criterion / fixture), then re-lint.",
  },
  E_DUPLICATE_ID: {
    title: "Duplicate id",
    meaning: "Two records share the same id — ids must be unique across the whole spec.",
    fix: "Rename one of the colliding records so every id is unique.",
  },
  E_UNDECLARED_CONTRACT: {
    title: "Undeclared contract",
    meaning:
      "A criterion or fixture points at a contractId that the preamble never declares — closed-world scope refuses it.",
    fix: "Either declare the contract in the preamble's contracts list, or correct the contractId to a declared one.",
  },
  E_MISSING_FIXTURES: {
    title: "Missing fixtures",
    meaning:
      "A behavioral criterion in a declared contract carries no fixture (or a graduatable judgment criterion has no calibration corpus) — prose without proof.",
    fix: "Add the fixture(s) that prove this criterion, or — if it genuinely can't be fixtured — mark it unfixturable with the reason.",
  },
  E_UNKNOWN_FIXTURE: {
    title: "Unknown fixture reference",
    meaning: "A criterion references a fixture id that no fixture record defines.",
    fix: "Add the missing fixture record, or fix the criterion's fixture reference to an existing id.",
  },
  E_DUPLICATE_IMPLEMENTER: {
    title: "Duplicate implementer",
    meaning:
      "Two roster entries share a name — roster-reference resolution can't tell them apart.",
    fix: "Give each implementer in the preamble's roster a unique name.",
  },
  E_MULTIPLE_OWNERS: {
    title: "Multiple repo-owners",
    meaning:
      "More than one implementer holds the repo-owner role — the promotion tiebreak needs exactly one.",
    fix: "Leave the repo-owner role on a single implementer in the preamble's roster.",
  },
  E_BAD_TOLERANCE: {
    title: "Unsatisfiable judgment tolerance",
    meaning:
      "A judgment criterion's tolerance has no strict majority (2·agreement ≤ runs) or agreement above runs — the bar can never be met.",
    fix: "Set agreement to a strict majority of runs (2·agreement > runs, agreement ≤ runs).",
  },
};

const UNKNOWN_CODE = {
  title: "Lint error",
  meaning: "This spec failed a lint check.",
  fix: "Inspect the referenced record and correct it, then re-lint.",
};

interface EnrichedError {
  code: string;
  ref: string;
  // human codebook
  title: string;
  meaning: string;
  fix: string;
  // the offending record resolved to its human content (when ref is a known id)
  recordKind: "item" | "criterion" | "fixture" | "preamble" | "unknown";
  human: string; // item title / criterion gherkin preview / fixture description / "preamble"
  itemId?: string; // for criteria — the parent item, for drill-down + history
  detail?: Record<string, unknown>; // the full offending record content
}

interface EnrichedOrphan {
  id: string;
  description: string;
  format: string;
  contractId?: string; // which contract it dangles from (may be undefined — advisory)
}

/** Fixtures referenced by no criterion — the warning the LintResult omits, the
 * CLI scatters across stderr, and dispatch.ts surfaces in-band. Computed here so
 * the widget is "clean" only when BOTH errors and orphans are empty. */
function orphanIds(spec: SpecRecord[]): string[] {
  const referenced = new Set(
    spec.flatMap((r) => (r.record === "criterion" ? (r as Criterion).fixtures : [])),
  );
  const ids = spec
    .filter((r): r is Fixture => r.record === "fixture" && !referenced.has((r as Fixture).id))
    .map((f) => f.id);
  return [...new Set(ids)].sort();
}

function lintModel(args: Record<string, unknown>): Record<string, unknown> {
  const p = resolveProject(args.project as string | undefined);
  // lint MUST see the full spec — preamble + items + criteria (spec.jsonl) AND
  // the fixtures (fixtures.jsonl) — or it flags every reference E_UNKNOWN_FIXTURE.
  // resolveProject.fullSpec is that concatenation (resolveSpec parity).
  const spec: SpecRecord[] = p.fullSpec;

  const result = lint(spec);
  const orphans = orphanIds(spec);

  // Indexes for resolving a ref to its human content.
  const items: Record<string, Item> = {};
  const crits: Record<string, Criterion> = {};
  const fixturesById: Record<string, Fixture> = {};
  let preamble: Preamble | undefined;
  for (const r of spec) {
    if (r.record === "item") items[(r as Item).id] = r as Item;
    else if (r.record === "criterion") crits[(r as Criterion).id] = r as Criterion;
    else if (r.record === "fixture") fixturesById[(r as Fixture).id] = r as Fixture;
    else if (r.record === "preamble") preamble = r as Preamble;
  }

  const preview = (s: string | undefined, n = 160): string => {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };

  // Resolve each {code, ref} to its human codebook entry + the offending record.
  const errorsEnriched: EnrichedError[] = result.errors.map((e) => {
    const book = CODE_BOOK[e.code] ?? UNKNOWN_CODE;
    let recordKind: EnrichedError["recordKind"] = "unknown";
    let human = "";
    let itemId: string | undefined;
    let detail: Record<string, unknown> | undefined;

    if (e.ref === "preamble" && preamble) {
      recordKind = "preamble";
      human = preamble.name ? `${preamble.name} (preamble)` : "preamble";
      detail = { implementers: preamble.implementers, contracts: preamble.contracts };
    } else if (crits[e.ref]) {
      const c = crits[e.ref];
      recordKind = "criterion";
      human = preview(c.gherkin) || `${c.force} criterion in ${c.contractId ?? "advisory scope"}`;
      itemId = c.itemId;
      detail = {
        itemId: c.itemId,
        contractId: c.contractId,
        force: c.force,
        state: c.state,
        class: c.class,
        gherkin: c.gherkin,
        fixtures: c.fixtures,
      };
    } else if (items[e.ref]) {
      const it = items[e.ref];
      recordKind = "item";
      human = it.title || it.id;
      detail = { title: it.title, body: it.body };
    } else if (fixturesById[e.ref]) {
      const f = fixturesById[e.ref];
      recordKind = "fixture";
      human = f.description || f.id;
      detail = { description: f.description, format: f.format, contractId: f.contractId };
    } else {
      // E_DUPLICATE_IMPLEMENTER's ref is an implementer NAME, not a record id.
      if (e.code === "E_DUPLICATE_IMPLEMENTER") {
        recordKind = "preamble";
        human = `implementer "${e.ref}" (roster)`;
      } else {
        human = e.ref;
      }
    }
    return { code: e.code, ref: e.ref, ...book, recordKind, human, itemId, detail };
  });

  // Orphan fixtures resolved to description + format + the contract they dangle from.
  const orphansEnriched: EnrichedOrphan[] = orphans.map((id) => {
    const f = fixturesById[id];
    return {
      id,
      description: f?.description ?? "",
      format: f?.format ?? "",
      contractId: f?.contractId,
    };
  });

  // Stats for the clean bill of health — what the inspection actually checked.
  const stats = {
    records: spec.length,
    items: Object.keys(items).length,
    criteria: Object.keys(crits).length,
    fixtures: Object.keys(fixturesById).length,
    referencedFixtures: Object.keys(fixturesById).length - orphans.length,
  };

  return {
    project: p.name,
    spec: preamble?.name ?? p.name,
    version: preamble?.conformanceVersion ?? "",
    result, // { valid, errors }
    errorsEnriched,
    orphansEnriched,
    stats,
    items: p.items,
    fixtures: p.fixtures,
    history: p.history,
  } as unknown as Record<string, unknown>;
}

export function registerLintWidget(server: McpServer): void {
  registerWidget(server, {
    tool: "felag_lint_view",
    uri: "ui://felag/lint",
    htmlFile: "lint.html",
    description:
      "Show the felag lint — felag-core's own merge gate, as a widget. " +
      "Inline = the spec name + a valid/invalid pill + 'N errors · M orphan fixtures' (or 'well-formed'). " +
      "Expand to fullscreen for the full report: when not clean, a card per lint error (the code + a " +
      "plain-English explanation of what it means and how to fix it, the offending record resolved to its " +
      "human content, and click-to-drill the related item/criterion + its governance history) and a card " +
      "per orphan fixture (description + format + the contract it dangles from). When clean, a rich passed-" +
      "inspection: ✓ well-formed, plus the stats it checked (records / items / criteria / fixtures, 0 orphans).",
    structured: lintModel,
  });
}
