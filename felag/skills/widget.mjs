// felag widget renderers — the Claude coupling layer.
//
// felag-core / felag-ts stay vendor-neutral: they produce the status MODEL
// (`felag status --json` / the felag_status MCP tool) and a neutral standalone
// HTML skin. THIS module is the "felag for Claude" distribution: it takes that
// model and returns an HTML *fragment* (not a full document) suitable for the
// Claude `show_widget` tool — styled with Claude's CSS custom properties,
// wired with `sendPrompt` action buttons, drilled with post-stream JS.
//
// Keep all of that Claude coupling HERE. None of these assumptions
// (--color-* vars, sendPrompt, show_widget) belong in src/.
//
// Snapshot, not a feed: a rendered widget is frozen at the moment it was asked
// for. There is no polling — rerun the skill for a fresh one. Action buttons
// don't act; they DRAFT an instruction (`felag: <plain-English intent>`) the
// human reviews and sends. The click is the governance act; felag runs the
// protocol; a fresh snapshot follows.
//
// Model shape (from src/status.ts computeStatus):
//   { name, version, verdict, scope:{kind,id}, counts:{status:n},
//     contracts:[{id, description, criteria:[CritView]}], criterion?:CritView }
//   CritView = { id, contractId, itemId, force, state, status, text, fixtures }
//   `status` ∈ conforming|drifting|waived|unverified|proposed|descriptive|
//             deprecated|disputed|in-flight|blocked|upcoming
//   `text` is a Gherkin scenario or "" (a judgment criterion).

// --- shared vocabulary --------------------------------------------------

// Status dot colors — fixed mid-ramp hex, chosen to read on both light and
// dark backgrounds. These are the ONE place a literal color is allowed: a
// status dot is a data glyph, not text. Everything else uses Claude CSS vars
// so it tracks the active theme. (Mirrors src/status.ts DOT, kept in sync.)
const DOT = {
  conforming: "#639922", "in-flight": "#378ADD", blocked: "#E24B4A",
  upcoming: "#888780", drifting: "#BA7517", waived: "#7F77DD",
  proposed: "#BA7517", descriptive: "#7F77DD", disputed: "#E24B4A",
  deprecated: "#888780", unverified: "#888780", neutral: "#888780",
  // lint diagnostics: an error reads the same red as a blocked criterion, an
  // orphan-fixture warning the same amber as drifting.
  error: "#E24B4A", orphan: "#BA7517",
};
const LABEL = {
  conforming: "Conforming", "in-flight": "In flight", blocked: "Blocked",
  upcoming: "Upcoming", drifting: "Drifting", waived: "Waived",
  proposed: "Proposed", descriptive: "Descriptive", disputed: "Disputed",
  deprecated: "Deprecated", unverified: "Unverified",
  error: "Error", orphan: "Orphan fixture",
};
// Board column order — same ordering src/status.ts uses for the summary strip.
const STATUS_ORDER = [
  "conforming", "in-flight", "blocked", "upcoming", "drifting",
  "waived", "proposed", "descriptive", "disputed", "deprecated", "unverified",
];

// Verdict pill: maps the spec-level verdict to a Claude background var. Text
// stays on a CSS var so it survives dark mode.
const VERDICT_BG = {
  conforms: "var(--color-background-success)",
  "conforms-with-waivers": "var(--color-background-warning)",
  drifts: "var(--color-background-danger)",
  unverified: "var(--color-background-secondary)",
};

// Review severity glyphs — the cold-review loop speaks CRITICAL / MAJOR / NIT,
// not the conformance status vocabulary. Same data-glyph rule: the dot color is
// a literal (a finding's severity is data), everything else is a CSS var. Colors
// are reused from DOT so a CRITICAL reads as the same red the board paints a
// blocked/disputed criterion, a MAJOR the same amber as drifting, a NIT gray.
const SEVERITY = {
  critical: { color: DOT.disputed, label: "Critical" },
  major: { color: DOT.drifting, label: "Major" },
  nit: { color: DOT.neutral, label: "Nit" },
};
const SEVERITY_ORDER = ["critical", "major", "nit"];

// The review verdict pill: the cold-review loop's verdict is MERGE | REWORK
// (REVISE is an alias some review rounds emit). MERGE is the green done-state,
// REWORK the amber keep-going. Distinct from VERDICT_BG (conformance verdicts).
const REVIEW_VERDICT_BG = {
  merge: "var(--color-background-success)",
  rework: "var(--color-background-warning)",
  revise: "var(--color-background-warning)",
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
// For an HTML attribute value (we always quote attributes with ").
const attr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
// For a single-quoted JS string literal inside an onclick attribute.
const jsStr = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// Monotonic per-render id so multiple widgets in one transcript don't collide
// on element ids / script scope. (Module-local; deterministic within a run.)
let _wid = 0;

function dot(status) {
  const color = DOT[status] ?? DOT.neutral;
  return `<span class="fw-dot" style="background:${color}" title="${attr(LABEL[status] ?? status)}"></span>`;
}

function badge(text, extra = "") {
  return `<span class="fw-badge${extra ? " " + extra : ""}">${esc(text)}</span>`;
}

// Action button: outline, draws a `felag:`-prefixed sendPrompt (NO leading
// slash — a slash would trip command parsing), tabler outline icon, ↗ suffix.
// The click drafts; the human sends.
function actionButton(label, intent, icon) {
  const call = `sendPrompt('felag: ${jsStr(intent)}')`;
  return `<button type="button" class="fw-act" onclick="${attr(call)}">` +
    `<i class="ti ti-${icon}"></i> ${esc(label)} <span class="fw-arr">↗</span></button>`;
}

// The action set a criterion offers is a function of its derived status.
function criterionActions(c) {
  if (c.status === "proposed") {
    return [
      actionButton("Approve", `approve proposed criterion ${c.id}`, "check"),
      actionButton("Make descriptive", `make criterion ${c.id} descriptive`, "file-text"),
      actionButton("Dispute", `dispute criterion ${c.id}`, "alert-triangle"),
    ];
  }
  if (c.status === "drifting") {
    return [
      actionButton("See failures", `show failing fixtures for criterion ${c.id}`, "list-search"),
      actionButton("Waive", `waive criterion ${c.id}`, "shield-off"),
    ];
  }
  return [];
}

// A criterion card — the shared unit across every felag widget.
function criterionCard(c) {
  const gherkin = (c.text ?? "").trim();
  const body = gherkin
    ? `<pre class="fw-gherkin">${esc(gherkin)}</pre>`
    : `<p class="fw-judgment">(judgment criterion)</p>`;
  const acts = criterionActions(c);
  const actsRow = acts.length ? `<div class="fw-acts">${acts.join("")}</div>` : "";
  return `<div class="fw-card" data-status="${attr(c.status)}" data-id="${attr(c.id)}">
    ${dot(c.status)}
    <div class="fw-card-body">
      <div class="fw-card-head">
        <span class="fw-id">${esc(c.id)}</span>
        ${badge(c.force)}${badge(c.state, "fw-state")}${badge(LABEL[c.status] ?? c.status)}
      </div>
      ${body}${actsRow}
    </div>
  </div>`;
}

function summaryStrip(counts) {
  const cells = STATUS_ORDER.filter((s) => counts[s])
    .map((s) => `<span class="fw-sum">${dot(s)}${esc(LABEL[s] ?? s)} <b>${counts[s]}</b></span>`)
    .join("");
  return `<div class="fw-strip">${cells}</div>`;
}

function verdictPill(verdict) {
  const bg = VERDICT_BG[verdict] ?? VERDICT_BG.unverified;
  return `<span class="fw-pill" style="background:${bg}">${esc(verdict)}</span>`;
}

// Scoped stylesheet. Every text/background hook is a Claude CSS var so the
// widget tracks the active theme; the only literals are status-dot/pill data
// glyphs (set inline above), never text color.
function styles(root) {
  return `<style>
  #${root}{padding:0.5rem 1rem;font-weight:400;color:var(--color-text-primary)}
  #${root} .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  #${root} .fw-header{display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem}
  #${root} .fw-name{font-weight:500;color:var(--color-text-primary)}
  #${root} .fw-version{font-size:0.8rem;color:var(--color-text-tertiary)}
  #${root} .fw-pill{font-size:0.72rem;font-weight:500;padding:0.1rem 0.55rem;border-radius:var(--border-radius-md);color:var(--color-text-primary)}
  #${root} .fw-strip{display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.6rem}
  #${root} .fw-sum{display:flex;align-items:center;gap:0.35rem;font-size:0.74rem;color:var(--color-text-secondary);background:var(--color-background-secondary);border-radius:var(--border-radius-md);padding:0.2rem 0.5rem}
  #${root} .fw-sum b{font-weight:500;color:var(--color-text-primary)}
  #${root} .fw-toggle{display:inline-flex;gap:0;border:0.5px solid var(--color-border-secondary);border-radius:var(--border-radius-md);overflow:hidden;margin-bottom:0.6rem}
  #${root} .fw-toggle button{font:inherit;font-size:0.74rem;font-weight:400;padding:0.2rem 0.7rem;background:transparent;color:var(--color-text-secondary);border:0;cursor:pointer}
  #${root} .fw-toggle button[aria-pressed="true"]{background:var(--color-background-secondary);color:var(--color-text-primary);font-weight:500}
  #${root} .fw-section{margin-bottom:1rem}
  #${root} .fw-section-title{font-size:0.8rem;font-weight:500;color:var(--color-text-primary);margin:0.25rem 0 0.4rem}
  #${root} .fw-section-desc{font-size:0.74rem;color:var(--color-text-tertiary);margin:0 0 0.4rem}
  #${root} .fw-card{display:flex;gap:0.6rem;border:0.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-md);padding:0.5rem 0.7rem;margin-bottom:0.4rem;background:var(--color-background-primary)}
  #${root} .fw-dot{width:0.55rem;height:0.55rem;border-radius:50%;flex:none;margin-top:0.3rem}
  #${root} .fw-card-body{flex:1;min-width:0}
  #${root} .fw-card-head{display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.25rem}
  #${root} .fw-id{font-family:ui-monospace,monospace;font-size:0.74rem;color:var(--color-text-secondary)}
  #${root} .fw-badge{font-size:0.68rem;font-weight:500;padding:0.05rem 0.45rem;border-radius:var(--border-radius-md);background:var(--color-background-secondary);color:var(--color-text-secondary)}
  #${root} .fw-gherkin{font-family:ui-monospace,monospace;font-size:0.72rem;line-height:1.5;white-space:pre-wrap;margin:0.15rem 0 0;color:var(--color-text-primary)}
  #${root} .fw-judgment{font-size:0.74rem;font-style:italic;color:var(--color-text-tertiary);margin:0.15rem 0 0}
  #${root} .fw-acts{display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.45rem}
  #${root} .fw-act{font:inherit;font-size:0.72rem;font-weight:400;padding:0.2rem 0.6rem;background:transparent;color:var(--color-text-primary);border:0.5px solid var(--color-border-secondary);border-radius:var(--border-radius-md);cursor:pointer;display:inline-flex;align-items:center;gap:0.3rem}
  #${root} .fw-act:hover{background:var(--color-background-secondary)}
  #${root} .fw-arr{color:var(--color-text-tertiary)}
  #${root} .fw-board{display:flex;gap:0.6rem;overflow-x:auto;align-items:flex-start}
  #${root} .fw-col{flex:1 0 13rem;min-width:13rem}
  #${root} .fw-col-head{display:flex;align-items:center;gap:0.35rem;font-size:0.76rem;font-weight:500;color:var(--color-text-primary);margin:0.2rem 0 0.4rem}
  #${root} .fw-empty{font-size:0.74rem;color:var(--color-text-tertiary);padding:0.5rem 0}
  #${root} .fw-detail{border:0.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:0.7rem 0.9rem;background:var(--color-background-primary)}
  #${root} .fw-meta{font-size:0.74rem;color:var(--color-text-tertiary);margin:0.3rem 0}
  #${root} .fw-chips{display:flex;flex-wrap:wrap;gap:0.3rem;margin:0.2rem 0 0.5rem}
  #${root} .fw-chip{font-family:ui-monospace,monospace;font-size:0.7rem;padding:0.1rem 0.45rem;border-radius:var(--border-radius-md);background:var(--color-background-secondary);color:var(--color-text-secondary)}
  #${root} .fw-chip-out{font-family:ui-monospace,monospace;font-size:0.7rem;padding:0.1rem 0.45rem;border-radius:var(--border-radius-md);background:transparent;color:var(--color-text-tertiary);border:0.5px dashed var(--color-border-secondary);text-decoration:line-through}
  </style>`;
}

// --- public renderers ---------------------------------------------------

// The board. Summary strip + a Spec⟷Board toggle over the SAME criterion
// cards (the toggle proves the spec view and the kanban are one thing keyed on
// the criterion) + the whole-spec actions. Scope-aware: a criterion-scope
// model renders a single detail card instead.
export function renderStatusWidget(model) {
  const root = `fw-status-${_wid++}`;
  const m = model ?? {};
  const counts = m.counts ?? {};
  const contracts = m.contracts ?? [];

  // criterion scope → detail card.
  if (m.scope?.kind === "criterion" && m.criterion) {
    return renderCriterionDetail(root, m);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const summary = `${m.name ?? "spec"} ${m.version ?? ""} — ${m.verdict ?? "unverified"}, ${total} criteria`;

  // Spec view: contracts in spec order, each a titled section of cards.
  const allCrits = contracts.flatMap((ct) => ct.criteria ?? []);
  const specView = contracts.map((ct) => {
    const crits = ct.criteria ?? [];
    const conf = crits.filter((c) => c.status === "conforming").length;
    return `<div class="fw-section">
      <div class="fw-section-title">${esc(ct.id)} <span class="fw-section-desc" style="display:inline">${conf}/${crits.length} conforming</span></div>
      <p class="fw-section-desc">${esc(ct.description ?? "")}</p>
      ${crits.map(criterionCard).join("")}
    </div>`;
  }).join("");

  // Board view: the same cards regrouped into status columns (the kanban).
  const boardCols = STATUS_ORDER.filter((s) => counts[s]).map((s) => {
    const crits = allCrits.filter((c) => c.status === s);
    return `<div class="fw-col">
      <div class="fw-col-head">${dot(s)}${esc(LABEL[s] ?? s)} <span class="fw-version">${crits.length}</span></div>
      ${crits.map(criterionCard).join("")}
    </div>`;
  }).join("");
  const boardView = `<div class="fw-board">${boardCols}</div>`;

  const wholeActions = `<div class="fw-acts">
    ${actionButton("Re-verify", `re-verify ${m.name ?? "the spec"}`, "refresh")}
    ${actionButton("Audit", `audit ${m.name ?? "the spec"} into a work plan`, "checklist")}
  </div>`;

  const toggle = `<div class="fw-toggle" role="group" aria-label="View">
    <button type="button" data-view="spec" aria-pressed="true" onclick="${attr(`window.__felagView('${root}','spec')`)}">Spec</button>
    <button type="button" data-view="board" aria-pressed="false" onclick="${attr(`window.__felagView('${root}','board')`)}">Board</button>
  </div>`;

  const script = `<script>
  window.__felagView = window.__felagView || function(root, view){
    var el = document.getElementById(root); if(!el) return;
    el.querySelectorAll('.fw-toggle button').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.view===view)); });
    var s = el.querySelector('[data-view-pane="spec"]'); var b = el.querySelector('[data-view-pane="board"]');
    if(s) s.style.display = view==='spec' ? '' : 'none';
    if(b) b.style.display = view==='board' ? '' : 'none';
  };
  </script>`;

  return `<div id="${root}" class="felag-widget">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    <div class="fw-header">
      <span class="fw-name">${esc(m.name ?? "spec")}</span>
      <span class="fw-version">${esc(m.version ?? "")}</span>
      ${verdictPill(m.verdict ?? "unverified")}
    </div>
    ${summaryStrip(counts)}
    ${toggle}
    <div data-view-pane="spec">${specView || `<p class="fw-empty">No contracts to show.</p>`}</div>
    <div data-view-pane="board" style="display:none">${boardView}</div>
    ${wholeActions}
    ${script}
  </div>`;
}

function renderCriterionDetail(root, m) {
  const c = m.criterion;
  const gherkin = (c.text ?? "").trim();
  const body = gherkin
    ? `<pre class="fw-gherkin">${esc(gherkin)}</pre>`
    : `<p class="fw-judgment">(judgment criterion)</p>`;
  const acts = criterionActions(c);
  const actsRow = acts.length ? `<div class="fw-acts">${acts.join("")}</div>` : "";
  const summary = `${esc(c.id)} — ${LABEL[c.status] ?? c.status}`;
  return `<div id="${root}" class="felag-widget">
    <h2 class="sr-only">${summary}</h2>
    ${styles(root)}
    <div class="fw-header">
      <span class="fw-name">${esc(m.name ?? "spec")}</span>
      <span class="fw-version">${esc(m.version ?? "")}</span>
      ${verdictPill(m.verdict ?? "unverified")}
    </div>
    <div class="fw-detail">
      <div class="fw-card-head">
        ${dot(c.status)}<span class="fw-id">${esc(c.id)}</span>
        ${badge(c.force)}${badge(c.state, "fw-state")}${badge(LABEL[c.status] ?? c.status)}
      </div>
      <p class="fw-meta">${esc(c.contractId ?? "")}${c.contractDesc ? " · " + esc(c.contractDesc) : ""}</p>
      ${body}
      <p class="fw-meta">fixtures: ${(c.fixtures ?? []).map(esc).join(", ") || "(none)"}</p>
      ${actsRow}
    </div>
  </div>`;
}

// The HITL ratification surface. Proposed criteria ONLY, each a card with the
// governance actions: approve / make descriptive / dispute. (Proposed criteria
// wait here; the human signs each with a button — the click lands in the
// transcript as the governance act.)
export function renderReviewQueueWidget(model) {
  const root = `fw-queue-${_wid++}`;
  const m = model ?? {};
  const proposed = (m.contracts ?? [])
    .flatMap((ct) => (ct.criteria ?? []).map((c) => ({ ...c, _contract: ct })))
    .filter((c) => c.status === "proposed");
  const summary = `${proposed.length} proposed criteria awaiting ratification — ${m.name ?? "spec"}`;

  const cards = proposed.length
    ? proposed.map(criterionCard).join("")
    : `<p class="fw-empty"><i class="ti ti-check"></i> Nothing proposed — the review queue is clear.</p>`;

  return `<div id="${root}" class="felag-widget">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    <div class="fw-header">
      <span class="fw-name">${esc(m.name ?? "spec")}</span>
      <span class="fw-version">${esc(m.version ?? "")}</span>
      <span class="fw-pill" style="background:var(--color-background-info)">Review queue</span>
    </div>
    <p class="fw-section-desc">Proposed criteria wait for a human to sign them. Each button drafts the governance act — you review and send.</p>
    ${cards}
  </div>`;
}

// --- verify -------------------------------------------------------------

// The columns a ConformanceReport carries. A report names criterion ids only
// (no force/state/text), so verify renders a LIGHT card — id + status + the
// verify-specific actions — not the full criterionCard (which needs a CritView).
// dotStatus reuses the shared status vocabulary so the colors match every other
// felag widget: a failing criterion is the same orange "drifting" dot the board
// shows it as. The label is the report's own word.
const VERIFY_COLS = [
  { key: "failing", dotStatus: "drifting", label: "Failing" },
  { key: "waived", dotStatus: "waived", label: "Waived" },
  { key: "disputed", dotStatus: "disputed", label: "Disputed" },
];

// Light report card: a bare criterion id under a verify column. No Gherkin —
// the report doesn't carry it; the actions bridge back to the spec/work store.
function verifyCard(id, dotStatus, label, acts) {
  const actsRow = acts && acts.length ? `<div class="fw-acts">${acts.join("")}</div>` : "";
  return `<div class="fw-card" data-status="${attr(dotStatus)}" data-id="${attr(id)}">
    ${dot(dotStatus)}
    <div class="fw-card-body">
      <div class="fw-card-head">
        <span class="fw-id">${esc(id)}</span>
        ${badge(label)}
      </div>
      ${actsRow}
    </div>
  </div>`;
}

// From `felag verify` (a ConformanceReport): the verdict pill, a count strip
// over failing/waived/disputed, and those criterion ids as cards grouped by
// column. A failing card bridges to work (open it) or to the diagnosis (why);
// the whole report offers re-verify and audit. A clean conforms with nothing
// outstanding is a one-line success state — no empty columns forced.
export function renderVerifyWidget(report) {
  const root = `fw-verify-${_wid++}`;
  const r = report ?? {};
  const impl = r.implementation ?? "implementation";
  const version = r.conformanceVersion ?? "";
  const verdict = r.verdict ?? "unverified";
  const lists = {
    failing: r.failing ?? [],
    waived: r.waived ?? [],
    disputed: r.disputed ?? [],
  };
  const advisory = r.advisory ?? [];
  const hasContent = lists.failing.length || lists.waived.length || lists.disputed.length;

  const header = `<div class="fw-header">
      <span class="fw-name">${esc(impl)}</span>
      <span class="fw-version">${esc(version)}</span>
      ${verdictPill(verdict)}
    </div>`;

  // Clean conforms with nothing outstanding → success state, not empty columns.
  if (!hasContent) {
    const summary = `${impl} ${verdict} — every gating criterion passes`;
    const advisoryNote = advisory.length
      ? `<p class="fw-meta">advisory: ${advisory.map((a) => `${esc(a.criterionId)} (${esc(a.verdict)})`).join(", ")}</p>`
      : "";
    return `<div id="${root}" class="felag-widget">
      <h2 class="sr-only">${esc(summary)}</h2>
      ${styles(root)}
      ${header}
      <p class="fw-empty"><i class="ti ti-circle-check"></i> ${esc(verdict)} — every gating criterion passes for ${esc(impl)}.</p>
      ${advisoryNote}
      <div class="fw-acts">${actionButton("Re-verify", `re-verify ${impl}`, "refresh")}</div>
    </div>`;
  }

  const summary = `${impl} ${verdict} — ${lists.failing.length} failing, ${lists.waived.length} waived, ${lists.disputed.length} disputed`;

  const strip = `<div class="fw-strip">${
    VERIFY_COLS.filter((col) => lists[col.key].length)
      .map((col) => `<span class="fw-sum">${dot(col.dotStatus)}${esc(col.label)} <b>${lists[col.key].length}</b></span>`)
      .join("")
  }</div>`;

  const sections = VERIFY_COLS.filter((col) => lists[col.key].length).map((col) => {
    const cards = lists[col.key].map((id) => {
      const acts = col.key === "failing"
        ? [
            actionButton("Open as work", `open ${id} as work`, "plus"),
            actionButton("Why it fails", `show me why ${id} fails`, "list-search"),
          ]
        : [];
      return verifyCard(id, col.dotStatus, col.label, acts);
    }).join("");
    return `<div class="fw-section">
      <div class="fw-section-title">${esc(col.label)} <span class="fw-section-desc" style="display:inline">${lists[col.key].length}</span></div>
      ${cards}
    </div>`;
  }).join("");

  const advisorySection = advisory.length
    ? `<div class="fw-section">
        <div class="fw-section-title">Advisory <span class="fw-section-desc" style="display:inline">${advisory.length}</span></div>
        <p class="fw-section-desc">Non-gating judgment criteria with records — diagnostic, gate no one.</p>
        ${advisory.map((a) => `<p class="fw-meta">${esc(a.criterionId)} — ${esc(a.verdict)}</p>`).join("")}
      </div>`
    : "";

  const wholeActions = `<div class="fw-acts">
    ${actionButton("Re-verify", `re-verify ${impl}`, "refresh")}
    ${actionButton("Audit into work plan", `audit ${impl} into a work plan`, "checklist")}
  </div>`;

  return `<div id="${root}" class="felag-widget">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    ${header}
    ${strip}
    ${sections}
    ${advisorySection}
    ${wholeActions}
  </div>`;
}

// --- audit --------------------------------------------------------------

// audit's proposals carry the fixtures inline in the description prose; pull
// them back out for a clean meta line. Falls back to "" (the card still shows
// the title + criterion id) if the format ever drifts — a view never throws.
function auditFixtures(description) {
  const m = /Fixtures:\s*(.+?)\.\s*$/.exec(String(description ?? ""));
  const fx = m && m[1] ? m[1].trim() : "";
  return fx && fx !== "(none)" ? fx : "";
}

// A proposed-work card: criterion id + the proposal title + the fixtures it
// needs, with per-item actions to file it or claim it.
function auditCard(p) {
  const fx = auditFixtures(p.description);
  const fxRow = fx ? `<p class="fw-meta">fixtures: ${esc(fx)}</p>` : "";
  return `<div class="fw-card" data-status="drifting" data-id="${attr(p.criterionId)}">
    ${dot("drifting")}
    <div class="fw-card-body">
      <div class="fw-card-head">
        <span class="fw-id">${esc(p.criterionId)}</span>
        ${badge("proposal")}
      </div>
      <p class="fw-section-desc" style="margin:0.1rem 0 0">${esc(p.title)}</p>
      ${fxRow}
      <div class="fw-acts">
        ${actionButton("Send to work store", `send ${p.criterionId} to the work store`, "send")}
        ${actionButton("Claim", `claim ${p.criterionId}`, "user-check")}
      </div>
    </div>
  </div>`;
}

// From `felag audit` (an AuditResult): the proposed work items — one per
// failing gating criterion — grouped by the spec item audit emits them under
// (the AuditResult carries no contract id; the spec item is the unit it groups
// by). The whole plan offers "send all". No proposals → a clean success state.
export function renderAuditWidget(result) {
  const root = `fw-audit-${_wid++}`;
  const res = result ?? {};
  const report = res.report ?? {};
  const proposals = res.proposals ?? [];
  const impl = report.implementation ?? "implementation";
  const version = report.conformanceVersion ?? "";

  const header = `<div class="fw-header">
      <span class="fw-name">${esc(impl)}</span>
      <span class="fw-version">${esc(version)}</span>
      <span class="fw-pill" style="background:var(--color-background-info)">Audit</span>
    </div>`;

  if (!proposals.length) {
    const summary = `No work proposed — ${impl} has no failing gating criteria`;
    return `<div id="${root}" class="felag-widget">
      <h2 class="sr-only">${esc(summary)}</h2>
      ${styles(root)}
      ${header}
      <p class="fw-empty"><i class="ti ti-circle-check"></i> Nothing to do — every gating criterion passes for ${esc(impl)}.</p>
      <div class="fw-acts">${actionButton("Re-audit", `audit ${impl} into a work plan`, "refresh")}</div>
    </div>`;
  }

  const summary = `${proposals.length} proposed work items from audit — ${impl}`;

  // Group by specItemRef in first-seen order (audit emits proposals in spec
  // order, so this keeps the plan reading top-to-bottom of the spec).
  const groups = [];
  const byRef = new Map();
  for (const p of proposals) {
    const ref = p.specItemRef ?? "(no item)";
    if (!byRef.has(ref)) {
      byRef.set(ref, []);
      groups.push(ref);
    }
    byRef.get(ref).push(p);
  }

  const sections = groups.map((ref) => {
    const items = byRef.get(ref);
    return `<div class="fw-section">
      <div class="fw-section-title">${esc(ref)} <span class="fw-section-desc" style="display:inline">${items.length}</span></div>
      ${items.map(auditCard).join("")}
    </div>`;
  }).join("");

  const wholeActions = `<div class="fw-acts">
    ${actionButton("Send all to taskstore", `send all ${proposals.length} audit proposals to the work store`, "checklist")}
  </div>`;

  return `<div id="${root}" class="felag-widget">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    ${header}
    <p class="fw-section-desc">${proposals.length} proposed work item${proposals.length === 1 ? "" : "s"} — one per failing gating criterion. Each button drafts the instruction; you review and send.</p>
    ${sections}
    ${wholeActions}
  </div>`;
}

// --- review -------------------------------------------------------------

// A severity dot. Same glyph shape as dot(), but keyed on the review severity
// vocabulary (critical/major/nit) instead of conformance status. Unknown
// severities fall back to the neutral gray so a view never throws.
function severityDot(severity) {
  const sev = SEVERITY[severity] ?? SEVERITY.nit;
  return `<span class="fw-dot" style="background:${sev.color}" title="${attr(sev.label)}"></span>`;
}

// The review verdict pill: MERGE green / REWORK amber. Verdict is matched
// case-insensitively; the pill shows the verdict's own word, uppercased.
function reviewPill(verdict) {
  const key = String(verdict ?? "").trim().toLowerCase();
  const bg = REVIEW_VERDICT_BG[key] ?? VERDICT_BG.unverified;
  return `<span class="fw-pill" style="background:${bg}">${esc(String(verdict ?? "unverified").toUpperCase())}</span>`;
}

// A cold-review finding card: a severity dot + the severity badge + an optional
// ref badge + the finding text, with a single per-finding action — fold it into
// the spec. The fold intent carries the ref when the finding has one (a stable
// handle), else the finding text itself; either way it's a draft the human
// reviews. "The round you write the sentence is the round you write the
// fixture" — folding is a spec edit AND a fixture, same round.
function reviewCard(f) {
  const severity = String(f.severity ?? "nit").toLowerCase();
  const sev = SEVERITY[severity] ?? SEVERITY.nit;
  const ref = (f.ref ?? "").trim();
  const handle = ref || (f.text ?? "").trim();
  const refBadge = ref ? badge(ref) : "";
  return `<div class="fw-card" data-severity="${attr(severity)}"${ref ? ` data-id="${attr(ref)}"` : ""}>
    ${severityDot(severity)}
    <div class="fw-card-body">
      <div class="fw-card-head">
        ${badge(sev.label)}${refBadge}
      </div>
      <p class="fw-section-desc" style="margin:0.1rem 0 0;color:var(--color-text-primary)">${esc(f.text ?? "")}</p>
      <div class="fw-acts">
        ${actionButton("Fold into spec", `fold ${handle} into the spec`, "git-merge")}
      </div>
    </div>
  </div>`;
}

// From a cold-review round (the model the /felag review skill builds by parsing
// scripts/cold-review.sh output): the round number, the verdict pill (MERGE
// green / REWORK amber), and the findings as cards grouped by severity
// (CRITICAL → MAJOR → NIT). Each finding folds into the spec; the whole round
// offers Re-review, and — only on MERGE — Merge. A MERGE with no findings is a
// one-line success state (the loop's terminal: nothing left to fold).
export function renderReviewWidget(model) {
  const root = `fw-review-${_wid++}`;
  const m = model ?? {};
  const specName = m.specName ?? "spec";
  const round = m.round ?? 1;
  const verdict = m.verdict ?? "unverified";
  const findings = m.findings ?? [];
  const isMerge = String(verdict).trim().toLowerCase() === "merge";

  const header = `<div class="fw-header">
      <span class="fw-name">${esc(specName)}</span>
      <span class="fw-version">Round ${esc(round)}</span>
      ${reviewPill(verdict)}
    </div>`;

  // MERGE with nothing left to fold → the loop's terminal success state.
  if (isMerge && !findings.length) {
    const summary = `${specName} round ${round} — MERGE, no findings`;
    return `<div id="${root}" class="felag-widget">
      <h2 class="sr-only">${esc(summary)}</h2>
      ${styles(root)}
      ${header}
      <p class="fw-empty"><i class="ti ti-circle-check"></i> MERGE — cold review found nothing left to fold in round ${esc(round)}.</p>
      <div class="fw-acts">
        ${actionButton("Merge", `merge ${specName}`, "git-merge")}
        ${actionButton("Re-review", `re-review ${specName}`, "refresh")}
      </div>
    </div>`;
  }

  // Count strip + sections, grouped by severity in CRITICAL → MAJOR → NIT order.
  const counts = {};
  for (const f of findings) {
    const s = String(f.severity ?? "nit").toLowerCase();
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const summary = `${specName} round ${round} — ${String(verdict).toUpperCase()}, ${findings.length} finding${findings.length === 1 ? "" : "s"}`;

  const strip = `<div class="fw-strip">${
    SEVERITY_ORDER.filter((s) => counts[s])
      .map((s) => `<span class="fw-sum">${severityDot(s)}${esc(SEVERITY[s].label)} <b>${counts[s]}</b></span>`)
      .join("")
  }</div>`;

  const sections = SEVERITY_ORDER.filter((s) => counts[s]).map((s) => {
    const cards = findings.filter((f) => String(f.severity ?? "nit").toLowerCase() === s)
      .map(reviewCard).join("");
    return `<div class="fw-section">
      <div class="fw-section-title">${esc(SEVERITY[s].label)} <span class="fw-section-desc" style="display:inline">${counts[s]}</span></div>
      ${cards}
    </div>`;
  }).join("");

  const wholeActions = `<div class="fw-acts">
    ${isMerge ? actionButton("Merge", `merge ${specName}`, "git-merge") : ""}
    ${actionButton("Re-review", `re-review ${specName}`, "refresh")}
  </div>`;

  return `<div id="${root}" class="felag-widget">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    ${header}
    <p class="fw-section-desc">${findings.length} finding${findings.length === 1 ? "" : "s"} from cold review round ${esc(round)}. Each button drafts the instruction; you review and send. The round you write the sentence is the round you write the fixture.</p>
    ${strip}
    ${sections}
    ${wholeActions}
  </div>`;
}

// --- render -------------------------------------------------------------

// The three audiences felag projects a spec for, in visibility-ramp order:
// stakeholder (least) → developer → verifier (everything). Each is a DISTINCT
// server-side projection, so the audience toggle re-renders via sendPrompt
// rather than switching a client-side pane (unlike status's Spec⟷Board toggle,
// which holds both datasets) — a render widget carries one audience's inventory
// at a time. The desc is the one-line "what this audience sees".
const AUDIENCES = [
  { key: "stakeholder", label: "Stakeholder", desc: "what a non-implementer sees — items and active criteria; no fixtures, no internal fields." },
  { key: "developer", label: "Developer", desc: "the build view — items, criteria, and fixtures; every field visible." },
  { key: "verifier", label: "Verifier", desc: "the full record — everything, including deprecated criteria." },
];

// From `felag render <spec> --audience <a>` (a RenderInventory: {included,
// excludedFields}): an audience toggle, the included record ids as a compact
// chip list, and the excludedFields as muted "hidden from this audience" chips.
// The inventory is vendor-neutral and carries no spec name; the skill may set
// `inventory.spec` so the re-render intents name the spec (graceful fallback to
// "the spec", mirroring verify's `implementation`). The audience buttons DRAFT a
// re-render — each audience is a fresh projection, not a client-side pane swap.
export function renderRenderWidget(inventory, audience) {
  const root = `fw-render-${_wid++}`;
  const inv = inventory ?? {};
  const included = inv.included ?? [];
  const excluded = inv.excludedFields ?? [];
  const spec = inv.spec ?? "the spec";
  const aud = String(audience ?? "stakeholder").toLowerCase();
  const meta = AUDIENCES.find((a) => a.key === aud) ?? AUDIENCES[0];
  const who = meta.label.toLowerCase();

  const summary = `${spec} render for ${who} — ${included.length} record${included.length === 1 ? "" : "s"} included, ${excluded.length} field${excluded.length === 1 ? "" : "s"} hidden`;

  // Audience toggle: a segmented control, current audience pressed. Every button
  // drafts a re-render (no leading slash — a slash would trip command parsing);
  // the pressed one re-drafts its own audience, the others switch.
  const toggle = `<div class="fw-toggle" role="group" aria-label="Audience">
    ${AUDIENCES.map((a) =>
      `<button type="button" data-aud="${a.key}" aria-pressed="${a.key === aud}" onclick="${attr(`sendPrompt('felag: render ${jsStr(spec)} for ${a.key}')`)}">${esc(a.label)}</button>`,
    ).join("")}
  </div>`;

  const includedChips = included.length
    ? `<div class="fw-chips">${included.map((id) => `<span class="fw-chip">${esc(id)}</span>`).join("")}</div>`
    : `<p class="fw-empty">No records included for this audience.</p>`;

  const excludedSection = excluded.length
    ? `<div class="fw-section">
        <div class="fw-section-title">Hidden from this audience <span class="fw-section-desc" style="display:inline">${excluded.length}</span></div>
        <p class="fw-section-desc">Fields projected out for ${esc(who)}s — present in the record, withheld from this view.</p>
        <div class="fw-chips">${excluded.map((f) => `<span class="fw-chip-out">${esc(f)}</span>`).join("")}</div>
      </div>`
    : `<p class="fw-section-desc"><i class="ti ti-eye"></i> Every field is visible to ${esc(who)}s — nothing projected out.</p>`;

  return `<div id="${root}" class="felag-widget">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    <div class="fw-header">
      <span class="fw-name">${esc(spec)}</span>
      <span class="fw-pill" style="background:var(--color-background-info)">Render</span>
    </div>
    ${toggle}
    <p class="fw-section-desc">${esc(meta.desc)}</p>
    <div class="fw-section">
      <div class="fw-section-title">Included <span class="fw-section-desc" style="display:inline">${included.length}</span></div>
      ${includedChips}
    </div>
    ${excludedSection}
  </div>`;
}

// --- lint ---------------------------------------------------------------

// From `felag lint` / the felag_lint MCP tool (a {valid, errors, orphanFixtures}
// result): lint is the merge gate, so this widget is DIAGNOSTIC — it reports,
// it doesn't govern. A clean pass (valid AND no orphan fixtures) is a single
// green one-liner, never empty sections. A failing/orphaned spec gets a count
// strip (errors red, orphan warnings amber) then a card per error (code badge +
// ref) and a muted card per orphan fixture. Orphan fixtures are WARNINGS, not
// errors — a committed fixture referenced by no criterion (the CLI's stderr
// warning) leaves `valid` true, so it shows but does not fail the gate.
//
// The lint result is vendor-neutral and carries no spec name; the skill may set
// `result.spec` so the re-lint intent names the spec (graceful fallback to "the
// spec", mirroring verify/render). The single optional action is a re-lint —
// lint is diagnostic, there is nothing to govern from here.
export function renderLintWidget(result, specName) {
  const root = `fw-lint-${_wid++}`;
  const r = result ?? {};
  const spec = specName ?? r.spec ?? "the spec";
  const errors = r.errors ?? [];
  const orphans = r.orphanFixtures ?? [];
  // valid reflects errors only; orphans are warnings. Clean = both empty.
  const clean = (r.valid ?? errors.length === 0) && orphans.length === 0;

  const header = `<div class="fw-header">
      <span class="fw-name">${esc(spec)}</span>
      <span class="fw-pill" style="background:var(--color-background-info)">Lint</span>
    </div>`;

  const reLint = `<div class="fw-acts">${actionButton("Re-lint", `re-lint ${spec}`, "refresh")}</div>`;

  // Clean: one green line, no forced empty sections.
  if (clean) {
    const summary = `${spec} lints clean — no errors, no orphan fixtures`;
    return `<div id="${root}" class="felag-widget">
      <h2 class="sr-only">${esc(summary)}</h2>
      ${styles(root)}
      ${header}
      <p class="fw-empty"><i class="ti ti-circle-check"></i> ${esc(spec)} lints clean — no errors, no orphan fixtures.</p>
      ${reLint}
    </div>`;
  }

  const summary = `${spec} — ${errors.length} lint error${errors.length === 1 ? "" : "s"}, ${orphans.length} orphan fixture${orphans.length === 1 ? "" : "s"}`;

  // No count strip: the section titles ("Errors 3", "Orphan fixtures 2")
  // already carry the counts, so a strip above them is pure duplication.
  // An error card: the lint code as a badge + the ref it points at (a record
  // id, or "preamble"). Red dot — an error fails the gate.
  const errorSection = errors.length
    ? `<div class="fw-section">
        <div class="fw-section-title">Errors <span class="fw-section-desc" style="display:inline">${errors.length}</span></div>
        ${errors.map((e) => `<div class="fw-card" data-status="error" data-id="${attr(e.ref)}">
          ${dot("error")}
          <div class="fw-card-body">
            <div class="fw-card-head">
              ${badge(e.code)}<span class="fw-id">${esc(e.ref)}</span>
            </div>
          </div>
        </div>`).join("")}
      </div>`
    : "";

  // An orphan-fixture card: muted (a warning, not a gate failure). The fixture
  // id is committed but referenced by no criterion — an interop proof for nothing.
  const orphanSection = orphans.length
    ? `<div class="fw-section">
        <div class="fw-section-title">Orphan fixtures <span class="fw-section-desc" style="display:inline">${orphans.length}</span></div>
        <p class="fw-section-desc">Committed fixtures referenced by no criterion — a warning, not a gate failure.</p>
        ${orphans.map((id) => `<div class="fw-card" data-status="orphan" data-id="${attr(id)}">
          ${dot("orphan")}
          <div class="fw-card-body">
            <div class="fw-card-head">
              ${badge("orphan")}<span class="fw-id">${esc(id)}</span>
            </div>
          </div>
        </div>`).join("")}
      </div>`
    : "";

  return `<div id="${root}" class="felag-widget">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    ${header}
    ${errorSection}
    ${orphanSection}
    ${reLint}
  </div>`;
}

// Thin dispatcher so future skills stay one-liners (design: renderFelagWidget).
export function renderFelagWidget(kind, model) {
  switch (kind) {
    case "status": return renderStatusWidget(model);
    case "review-queue": return renderReviewQueueWidget(model);
    case "verify": return renderVerifyWidget(model);
    case "audit": return renderAuditWidget(model);
    case "review": return renderReviewWidget(model);
    case "render": return renderRenderWidget(model, model?.audience);
    case "lint": return renderLintWidget(model, model?.spec);
    default: throw new Error(`unknown felag widget kind: ${kind}`);
  }
}
