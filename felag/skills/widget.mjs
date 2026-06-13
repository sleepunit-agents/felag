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
};
const LABEL = {
  conforming: "Conforming", "in-flight": "In flight", blocked: "Blocked",
  upcoming: "Upcoming", drifting: "Drifting", waived: "Waived",
  proposed: "Proposed", descriptive: "Descriptive", disputed: "Disputed",
  deprecated: "Deprecated", unverified: "Unverified",
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
  #${root} .fw-toggle{display:inline-flex;gap:0;border:1px solid var(--color-border-secondary);border-radius:var(--border-radius-md);overflow:hidden;margin-bottom:0.6rem}
  #${root} .fw-toggle button{font:inherit;font-size:0.74rem;font-weight:400;padding:0.2rem 0.7rem;background:transparent;color:var(--color-text-secondary);border:0;cursor:pointer}
  #${root} .fw-toggle button[aria-pressed="true"]{background:var(--color-background-secondary);color:var(--color-text-primary);font-weight:500}
  #${root} .fw-section-title{font-size:0.8rem;font-weight:500;color:var(--color-text-primary);margin:0.7rem 0 0.3rem}
  #${root} .fw-section-desc{font-size:0.74rem;color:var(--color-text-tertiary);margin:0 0 0.4rem}
  #${root} .fw-card{display:flex;gap:0.6rem;border:1px solid var(--color-border-tertiary);border-radius:var(--border-radius-md);padding:0.5rem 0.7rem;margin-bottom:0.4rem;background:var(--color-background-primary)}
  #${root} .fw-dot{width:0.55rem;height:0.55rem;border-radius:50%;flex:none;margin-top:0.3rem}
  #${root} .fw-card-body{flex:1;min-width:0}
  #${root} .fw-card-head{display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.25rem}
  #${root} .fw-id{font-family:ui-monospace,monospace;font-size:0.74rem;color:var(--color-text-secondary)}
  #${root} .fw-badge{font-size:0.68rem;font-weight:500;padding:0.05rem 0.45rem;border-radius:var(--border-radius-md);background:var(--color-background-secondary);color:var(--color-text-secondary)}
  #${root} .fw-gherkin{font-family:ui-monospace,monospace;font-size:0.72rem;line-height:1.5;white-space:pre-wrap;margin:0.15rem 0 0;color:var(--color-text-primary)}
  #${root} .fw-judgment{font-size:0.74rem;font-style:italic;color:var(--color-text-tertiary);margin:0.15rem 0 0}
  #${root} .fw-acts{display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.45rem}
  #${root} .fw-act{font:inherit;font-size:0.72rem;font-weight:400;padding:0.2rem 0.6rem;background:transparent;color:var(--color-text-primary);border:1px solid var(--color-border-secondary);border-radius:var(--border-radius-md);cursor:pointer;display:inline-flex;align-items:center;gap:0.3rem}
  #${root} .fw-act:hover{background:var(--color-background-secondary)}
  #${root} .fw-arr{color:var(--color-text-tertiary)}
  #${root} .fw-board{display:flex;gap:0.6rem;overflow-x:auto;align-items:flex-start}
  #${root} .fw-col{flex:1 0 13rem;min-width:13rem}
  #${root} .fw-col-head{display:flex;align-items:center;gap:0.35rem;font-size:0.76rem;font-weight:500;color:var(--color-text-primary);margin:0.2rem 0 0.4rem}
  #${root} .fw-empty{font-size:0.74rem;color:var(--color-text-tertiary);padding:0.5rem 0}
  #${root} .fw-detail{border:1px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:0.7rem 0.9rem;background:var(--color-background-primary)}
  #${root} .fw-meta{font-size:0.74rem;color:var(--color-text-tertiary);margin:0.3rem 0}
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

// Thin dispatcher so future skills stay one-liners (design: renderFelagWidget).
export function renderFelagWidget(kind, model) {
  switch (kind) {
    case "status": return renderStatusWidget(model);
    case "review-queue": return renderReviewQueueWidget(model);
    default: throw new Error(`unknown felag widget kind: ${kind}`);
  }
}
