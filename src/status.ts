// felag status — a human projection of a spec joined to its conformance.
// PRESENTATION, deliberately excluded surface (felag-core: "CLI output
// formatting, render aesthetics ... observable but undeclared, non-core").
// So this carries no contract and gates no one — it's a view.
//
// The spec is the work board: every criterion is a card, and its column is
// derived. v1 derives status from spec-state joined with verify (conformance).
// The work-layer columns (in-flight / blocked / upcoming) need the task store
// and arrive in v2 — the renderer already accepts a workStatus override so
// that join only adds data, never changes this shape.

import { verify } from "./verify.js";
import type {
  Criterion,
  Item,
  Preamble,
  SpecRecord,
  VerificationRecord,
  Waiver,
} from "./records.js";

export type CritStatus =
  | "conforming"
  | "drifting"
  | "waived"
  | "unverified"
  | "proposed"
  | "descriptive"
  | "deprecated"
  | "disputed"
  // work-layer overrides (v2) — accepted now, populated later:
  | "in-flight"
  | "blocked"
  | "upcoming";

export interface CritView {
  id: string;
  contractId?: string;
  itemId: string;
  force: string;
  state: string;
  status: CritStatus;
  text: string; // the Gherkin scenario — felag's readable form of a criterion
  fixtures: string[];
}

export interface StatusModel {
  name: string;
  version: string;
  verdict: string; // conforms | conforms-with-waivers | drifts | unverified
  scope: { kind: "whole" | "contract" | "criterion"; id?: string };
  counts: Record<string, number>;
  contracts: { id: string; description: string; criteria: CritView[] }[];
  criterion?: CritView & { contractDesc?: string }; // populated for criterion scope
}

export interface StatusOptions {
  records?: VerificationRecord[];
  waivers?: Waiver[];
  implementation?: string;
  asOf?: string;
  target?: string; // contract id → section; criterion id → detail; absent → whole
  workStatus?: Record<string, CritStatus>; // v2: task-layer override per criterion id
}

const STATUS_ORDER: CritStatus[] = [
  "conforming", "in-flight", "blocked", "upcoming", "drifting",
  "waived", "proposed", "descriptive", "disputed", "deprecated", "unverified",
];

function deriveStatus(
  c: Criterion,
  failing: Set<string>,
  waived: Set<string>,
  haveRecords: boolean,
  override?: CritStatus,
): CritStatus {
  if (override) return override;
  switch (c.state) {
    case "proposed": return "proposed";
    case "descriptive": return "descriptive";
    case "deprecated": return "deprecated";
    case "disputed": return "disputed";
    default: break; // active
  }
  if (!haveRecords) return "unverified";
  if (waived.has(c.id)) return "waived";
  if (failing.has(c.id)) return "drifting";
  return "conforming";
}

export function computeStatus(spec: SpecRecord[], opts: StatusOptions = {}): StatusModel {
  const preamble = spec.find((r): r is Preamble => r.record === "preamble");
  const criteria = spec.filter((r): r is Criterion => r.record === "criterion");
  const declared = preamble?.contracts ?? [];

  const haveRecords = Array.isArray(opts.records) && opts.records.length > 0;
  let failing = new Set<string>();
  let waivedSet = new Set<string>();
  let verdict = "unverified";
  if (haveRecords) {
    const report = verify({
      asOf: opts.asOf ?? new Date().toISOString(),
      implementation: opts.implementation ?? "impl",
      records: opts.records!,
      spec,
      waivers: opts.waivers ?? [],
    });
    failing = new Set(report.failing);
    waivedSet = new Set(report.waived);
    verdict = report.verdict;
  }

  const view = (c: Criterion): CritView => ({
    id: c.id,
    contractId: c.contractId,
    itemId: c.itemId,
    force: c.force,
    state: c.state,
    status: deriveStatus(c, failing, waivedSet, haveRecords, opts.workStatus?.[c.id]),
    text: (c.gherkin ?? "").trim(),
    fixtures: c.fixtures ?? [],
  });

  const counts: Record<string, number> = {};
  for (const c of criteria) {
    const s = view(c).status;
    counts[s] = (counts[s] ?? 0) + 1;
  }

  // Criterion scope → detail.
  if (opts.target) {
    const hit = criteria.find((c) => c.id === opts.target);
    if (hit) {
      const cv = view(hit);
      const cd = declared.find((d) => d.id === hit.contractId);
      return {
        name: preamble?.name ?? "spec",
        version: preamble?.conformanceVersion ?? "?",
        verdict,
        scope: { kind: "criterion", id: opts.target },
        counts,
        contracts: [],
        criterion: { ...cv, contractDesc: cd?.description },
      };
    }
  }

  // Contract scope → one section; else whole → all declared contracts.
  const contractIds = opts.target
    ? declared.filter((d) => d.id === opts.target)
    : declared;
  const contracts = contractIds.map((d) => ({
    id: d.id,
    description: d.description,
    criteria: criteria.filter((c) => c.contractId === d.id).map(view),
  }));

  // Whole scope: criteria with no contractId (or one not declared) are real —
  // the conduct/governance judgment criteria that gate no one — and must stay
  // visible, or the summary counts won't equal the rows on screen.
  if (!opts.target) {
    const declaredIds = new Set(declared.map((d) => d.id));
    const orphans = criteria.filter((c) => c.contractId === undefined || !declaredIds.has(c.contractId));
    if (orphans.length) {
      contracts.push({
        id: "(no contract)",
        description: "Conduct and governance criteria — carry no contract, gate no implementation.",
        criteria: orphans.map(view),
      });
    }
  }

  return {
    name: preamble?.name ?? "spec",
    version: preamble?.conformanceVersion ?? "?",
    verdict,
    scope: { kind: opts.target ? "contract" : "whole", id: opts.target },
    counts,
    contracts,
  };
}

// ---- standalone HTML skin (for `felag status --out file.html` / browser) ----

const DOT: Record<string, string> = {
  conforming: "#639922", "in-flight": "#378ADD", blocked: "#E24B4A",
  upcoming: "#888780", drifting: "#BA7517", waived: "#7F77DD",
  proposed: "#BA7517", descriptive: "#7F77DD", disputed: "#E24B4A",
  deprecated: "#888780", unverified: "#888780",
};
const LABEL: Record<string, string> = {
  conforming: "Conforming", "in-flight": "In flight", blocked: "Blocked",
  upcoming: "Upcoming", drifting: "Drifting", waived: "Waived",
  proposed: "Proposed", descriptive: "Descriptive", disputed: "Disputed",
  deprecated: "Deprecated", unverified: "Unverified",
};
const esc = (s: string): string =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

function critRow(c: CritView): string {
  return `<div class="row"><span class="dot" style="background:${DOT[c.status]}" title="${LABEL[c.status]}"></span>
    <div class="rbody"><div class="rhead"><span class="id">${esc(c.id)}</span>
      <span class="badge">${esc(c.force)}</span><span class="badge st-${c.state}">${esc(c.state)}</span></div>
      <pre class="gherkin">${esc(c.text)}</pre></div></div>`;
}

export function renderStatusHTML(m: StatusModel): string {
  const summary = STATUS_ORDER.filter((s) => m.counts[s])
    .map((s) => `<div class="sum"><span class="dot" style="background:${DOT[s]}"></span>${LABEL[s]} <b>${m.counts[s]}</b></div>`)
    .join("");

  let body: string;
  if (m.scope.kind === "criterion" && m.criterion) {
    const c = m.criterion;
    body = `<div class="detail"><div class="rhead"><span class="dot" style="background:${DOT[c.status]}"></span>
      <span class="id big">${esc(c.id)}</span><span class="badge">${esc(c.force)}</span>
      <span class="badge st-${c.state}">${esc(c.state)}</span><span class="badge">${LABEL[c.status]}</span></div>
      <p class="meta">${esc(c.contractId ?? "")} ${c.contractDesc ? "· " + esc(c.contractDesc) : ""}</p>
      <pre class="gherkin">${esc(c.text)}</pre>
      <p class="meta">fixtures: ${c.fixtures.map(esc).join(", ") || "(none)"}</p></div>`;
  } else {
    body = m.contracts.map((ct) => {
      const conf = ct.criteria.filter((c) => c.status === "conforming").length;
      return `<h2>${esc(ct.id)} <span class="meta">${conf}/${ct.criteria.length} conforming</span></h2>
        <p class="meta">${esc(ct.description)}</p>${ct.criteria.map(critRow).join("")}`;
    }).join("");
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>felag status · ${esc(m.name)}</title><style>
:root{--bg:#fff;--fg:#1a1a18;--mut:#5f5e5a;--hint:#888780;--surf:#f1efe8;--line:rgba(0,0,0,.12)}
@media(prefers-color-scheme:dark){:root{--bg:#1a1a18;--fg:#eceae3;--mut:#b4b2a9;--hint:#888780;--surf:#2c2c2a;--line:rgba(255,255,255,.14)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,sans-serif;padding:1.25rem 1.5rem;max-width:840px}
h1{font-size:20px;font-weight:500;margin:0 0 4px}h2{font-size:15px;font-weight:500;margin:22px 0 6px}
.sub{color:var(--mut);font-size:13px;margin:0 0 16px}.meta{color:var(--hint);font-size:12px;font-weight:400}
.bar{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.sum{background:var(--surf);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--mut);display:flex;align-items:center;gap:6px}.sum b{color:var(--fg);font-weight:500}
.row,.detail{display:flex;gap:10px;border:.5px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:6px;background:var(--bg)}
.detail{flex-direction:column}.dot{width:9px;height:9px;border-radius:50%;flex:none;margin-top:5px}
.rbody{flex:1;min-width:0}.rhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px}
.id{font-family:ui-monospace,monospace;font-size:12px;color:var(--mut)}.id.big{font-size:14px;color:var(--fg)}
.badge{font-size:11px;font-weight:500;padding:1px 7px;border-radius:8px;background:var(--surf);color:var(--mut)}
.st-active{color:#3b6d11}.st-proposed{color:#854f0b}.st-descriptive{color:#185fa5}
.gherkin{font-family:ui-monospace,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;margin:0;color:var(--fg)}
</style></head><body>
<h1>${esc(m.name)} <span class="meta">${esc(m.version)} · ${esc(m.verdict)}</span></h1>
<p class="sub">felag status${m.scope.id ? " · " + esc(m.scope.id) : ""}</p>
<div class="bar">${summary}</div>${body}</body></html>`;
}
