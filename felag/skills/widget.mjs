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
  // authoring: an unresolved [NEEDS CLARIFICATION] reads the same amber as a
  // drifting/proposed thing — it needs attention before the spec is "ready".
  clarify: "#BA7517",
};
const LABEL = {
  conforming: "Conforming", "in-flight": "In flight", blocked: "Blocked",
  upcoming: "Upcoming", drifting: "Drifting", waived: "Waived",
  proposed: "Proposed", descriptive: "Descriptive", disputed: "Disputed",
  deprecated: "Deprecated", unverified: "Unverified",
  error: "Error", orphan: "Orphan fixture", clarify: "Needs clarification",
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
// For a single-quoted JS string literal inside an onclick attribute. Backslash
// MUST be escaped first; then the quote, then newlines/carriage returns, then
// any remaining C0 control char (an unescaped newline would split the literal
// and break the onclick, silently no-op'ing the button).
const jsStr = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    // Any remaining C0 control char (tab, form feed, NUL…) → \xNN.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, (c) => "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0"));

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

// Staged button: does NOT send. It queues an intent into the widget's staging
// tray (client-side). The human assembles a batch of authoring moves, reviews
// them as a block, then sends once via the tray's "Send batch" button. No ↗ —
// nothing leaves the widget until the batch is sent. Used where a surface
// invites many small moves before one governance act (authoring, review-queue).
function stagedButton(root, label, intent, icon) {
  const call = `window.__felagStage('${root}','${jsStr(intent)}')`;
  return `<button type="button" class="fw-act" onclick="${attr(call)}">` +
    `<i class="ti ti-${icon}"></i> ${esc(label)}</button>`;
}

// act(): a staged button when a staging root is given (the surface batches many
// moves into one send), else an immediate fill-the-box button. Lets the shared
// criterion/audit cards serve both the staging surfaces (new/review-queue/
// audit) and the immediate ones (the status board) from one definition.
function act(root, label, intent, icon) {
  return root ? stagedButton(root, label, intent, icon) : actionButton(label, intent, icon);
}

// The staging tray + its script. Buttons call __felagStage to queue intents;
// __felagSend joins the queue into ONE felag: block and fills the input (the
// human presses enter — the batch is the governance act). Dedupes by intent;
// each row is individually removable. Reusable across widgets; the root's
// data-subject names the spec the batch applies to.
function stagingTray(root) {
  return `<div class="fw-tray" data-tray><p class="fw-tray-empty">No actions staged — click actions above to queue them, then send as one block.</p></div>`;
}
function stagingScript() {
  return `<script>
  window.__felagStage = window.__felagStage || function(root, intent){
    var el = document.getElementById(root); if(!el) return;
    el.__staged = el.__staged || [];
    if(el.__staged.indexOf(intent) !== -1) return;
    el.__staged.push(intent); window.__felagTray(root);
  };
  window.__felagUnstage = window.__felagUnstage || function(root, i){
    var el = document.getElementById(root); if(!el || !el.__staged) return;
    el.__staged.splice(i,1); window.__felagTray(root);
  };
  window.__felagClear = window.__felagClear || function(root){
    var el = document.getElementById(root); if(!el) return;
    el.__staged = []; window.__felagTray(root);
  };
  window.__felagSend = window.__felagSend || function(root){
    var el = document.getElementById(root); if(!el || !el.__staged || !el.__staged.length) return;
    var subject = el.getAttribute('data-subject') || 'the spec';
    var lines = el.__staged.map(function(s,i){ return (i+1)+'. '+s; }).join('\\n');
    sendPrompt('felag: apply these actions to '+subject+':\\n'+lines);
  };
  window.__felagTray = window.__felagTray || function(root){
    var el = document.getElementById(root); if(!el) return;
    var tray = el.querySelector('[data-tray]'); if(!tray) return;
    var s = el.__staged || [];
    if(!s.length){ tray.innerHTML = '<p class="fw-tray-empty">No actions staged — click actions above to queue them, then send as one block.</p>'; return; }
    var rows = s.map(function(item,i){
      return '<div class="fw-tray-row"><span class="fw-tray-num">'+(i+1)+'.</span>'
        +'<span class="fw-tray-label">'+item.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span>'
        +'<button type="button" class="fw-tray-x" aria-label="Remove" onclick="window.__felagUnstage(\\''+root+'\\','+i+')">&times;</button></div>';
    }).join('');
    tray.innerHTML = '<div class="fw-tray-head">'+s.length+' action'+(s.length===1?'':'s')+' staged — sent as one block</div>'+rows
      +'<div class="fw-acts"><button type="button" class="fw-act" onclick="window.__felagSend(\\''+root+'\\')"><i class="ti ti-send"></i> Send batch <span class="fw-arr">&#8599;</span></button>'
      +'<button type="button" class="fw-act" onclick="window.__felagClear(\\''+root+'\\')"><i class="ti ti-x"></i> Clear</button></div>';
  };
  </script>`;
}

// The action set a criterion offers is a function of its derived status.
function criterionActions(c, root) {
  if (c.status === "proposed") {
    return [
      act(root, "Approve", `approve proposed criterion ${c.id}`, "check"),
      act(root, "Make descriptive", `make criterion ${c.id} descriptive`, "file-text"),
      act(root, "Dispute", `dispute criterion ${c.id}`, "alert-triangle"),
    ];
  }
  if (c.status === "drifting") {
    return [
      act(root, "See failures", `show failing fixtures for criterion ${c.id}`, "list-search"),
      act(root, "Waive", `waive criterion ${c.id}`, "shield-off"),
    ];
  }
  return [];
}

// A criterion card — the shared unit across every felag widget. Pass a staging
// `root` to make its actions queue into that widget's tray; omit it for the
// immediate fill-the-box behavior (the status board).
function criterionCard(c, root) {
  const gherkin = (c.text ?? "").trim();
  const body = gherkin
    ? `<pre class="fw-gherkin">${esc(gherkin)}</pre>`
    : `<p class="fw-judgment">(judgment criterion)</p>`;
  const acts = criterionActions(c, root);
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
  #${root} .fw-tray{border:0.5px dashed var(--color-border-secondary);border-radius:var(--border-radius-md);padding:0.5rem 0.7rem;background:var(--color-background-secondary)}
  #${root} .fw-tray-empty{font-size:0.74rem;color:var(--color-text-tertiary);margin:0}
  #${root} .fw-tray-head{font-size:0.74rem;font-weight:500;color:var(--color-text-primary);margin:0 0 0.3rem}
  #${root} .fw-tray-row{display:flex;align-items:center;gap:0.4rem;font-size:0.74rem;padding:0.15rem 0}
  #${root} .fw-tray-num{color:var(--color-text-tertiary);flex:none}
  #${root} .fw-tray-label{flex:1;min-width:0;color:var(--color-text-primary)}
  #${root} .fw-tray-x{border:0;background:transparent;cursor:pointer;color:var(--color-text-tertiary);font-size:0.95rem;line-height:1;padding:0 0.2rem}
  #${root} .fw-tray-x:hover{color:var(--color-text-danger)}
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
      ${crits.map((c) => criterionCard(c)).join("")}
    </div>`;
  }).join("");

  // Board view: the same cards regrouped into status columns (the kanban).
  const boardCols = STATUS_ORDER.filter((s) => counts[s]).map((s) => {
    const crits = allCrits.filter((c) => c.status === s);
    return `<div class="fw-col">
      <div class="fw-col-head">${dot(s)}${esc(LABEL[s] ?? s)} <span class="fw-version">${crits.length}</span></div>
      ${crits.map((c) => criterionCard(c)).join("")}
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
    ? proposed.map((c) => criterionCard(c, root)).join("")
    : `<p class="fw-empty"><i class="ti ti-check"></i> Nothing proposed — the review queue is clear.</p>`;

  // Staging tray only when there's something to ratify — an empty queue needs
  // no outbox.
  const traySection = proposed.length
    ? `<div class="fw-section"><div class="fw-section-title">Staged ratifications</div>${stagingTray(root)}</div>${stagingScript()}`
    : "";

  return `<div id="${root}" class="felag-widget" data-subject="${attr(m.name ?? "the spec")}">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    <div class="fw-header">
      <span class="fw-name">${esc(m.name ?? "spec")}</span>
      <span class="fw-version">${esc(m.version ?? "")}</span>
      <span class="fw-pill" style="background:var(--color-background-info)">Review queue</span>
    </div>
    <p class="fw-section-desc">Proposed criteria wait for a human to sign them. Stage the calls — approve, dispute, make descriptive — and send the batch as one governance act.</p>
    ${cards}
    ${traySection}
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
function auditCard(p, root) {
  const fx = auditFixtures(p.description);
  const fxRow = fx ? `<p class="fw-meta">fixtures: ${esc(fx)}</p>` : "";
  // TaskProposal.criterionId is optional (src/tasks/store.ts) — fall back to the
  // spec item ref so a proposal without one never renders "undefined".
  const ref = p.criterionId ?? p.specItemRef;
  return `<div class="fw-card" data-status="drifting" data-id="${attr(ref)}">
    ${dot("drifting")}
    <div class="fw-card-body">
      <div class="fw-card-head">
        <span class="fw-id">${esc(ref)}</span>
        ${badge("proposal")}
      </div>
      <p class="fw-section-desc" style="margin:0.1rem 0 0">${esc(p.title)}</p>
      ${fxRow}
      <div class="fw-acts">
        ${act(root, "Send to work store", `send ${ref} to the work store`, "send")}
        ${act(root, "Claim", `claim ${ref}`, "user-check")}
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
      ${items.map((p) => auditCard(p, root)).join("")}
    </div>`;
  }).join("");

  // Per-item sends stage into the tray; "Send all" stays a single bulk shot.
  const traySection = `<div class="fw-section"><div class="fw-section-title">Staged work</div>${stagingTray(root)}</div>`;
  const wholeActions = `<div class="fw-acts">
    ${actionButton("Send all to taskstore", `send all ${proposals.length} audit proposals to the work store`, "checklist")}
  </div>`;

  return `<div id="${root}" class="felag-widget" data-subject="${attr(impl)}">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    ${header}
    <p class="fw-section-desc">${proposals.length} proposed work item${proposals.length === 1 ? "" : "s"} — one per failing gating criterion. Stage the ones you want, or send them all at once.</p>
    ${sections}
    ${traySection}
    ${wholeActions}
    ${stagingScript()}
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

// /felag new — the authoring interview, live. The spec being authored is an
// in-progress object: criteria sorted into the three strata, a worklist of
// open [NEEDS CLARIFICATION] questions, and a ready-state that only flips once
// every clarification is resolved AND lint passes. This is the AUTHORING twin
// of renderStatusWidget: there, status is derived from verification; here,
// "ready" is derived from clarifications-resolved + lint-clean. A half-authored
// spec is a valid, re-openable state — the open-questions list IS the worklist
// you pick back up next session. Nothing is "done" until the human clicks the
// cold-review hand-off (review is the done-signal, not an assumed default).
//
// Model shape (from the /felag new skill driving the interview):
//   { spec, item?, contract:[Draft], profile:[string], excluded:[string],
//     clarifications:[{id, question, criterionId?}], lintClean?:bool }
//   Draft = { id, force, text(gherkin), fixture?:string|null } — a proposed
//   criterion. fixture missing ⇒ THE RULE unmet: not yet recordable.
export function renderInterviewWidget(model) {
  const root = `fw-new-${_wid++}`;
  const m = model ?? {};
  const spec = m.spec ?? "the spec";
  const contract = m.contract ?? [];
  const profile = m.profile ?? [];
  const excluded = m.excluded ?? [];
  const clarifications = m.clarifications ?? [];
  // THE RULE: a criterion isn't recordable without its fixture. Those, plus any
  // open clarification, are what stand between here and "ready".
  const needFixture = contract.filter((c) => !c.fixture);
  const lintClean = m.lintClean ?? true;
  const ready =
    contract.length > 0 && clarifications.length === 0 &&
    needFixture.length === 0 && lintClean;

  const summary = `Authoring ${spec} — ${contract.length} proposed, ${clarifications.length} open question${clarifications.length === 1 ? "" : "s"}${ready ? ", ready for review" : ""}`;

  const header = `<div class="fw-header">
      <span class="fw-name">${esc(spec)}</span>
      ${m.item ? `<span class="fw-version">${esc(m.item)}</span>` : ""}
      <span class="fw-pill" style="background:var(--color-background-info)">Authoring</span>
    </div>`;

  // A draft criterion card. Proposed (amber). If its fixture is missing, THE
  // RULE is unmet — say so and lead with Add fixture; otherwise offer Confirm.
  const draftCard = (c) => {
    const hasFx = !!c.fixture;
    const gherkin = (c.text ?? "").trim();
    const body = gherkin
      ? `<pre class="fw-gherkin">${esc(gherkin)}</pre>`
      : `<p class="fw-judgment">(judgment criterion)</p>`;
    const fxLine = hasFx
      ? `<p class="fw-meta">fixture: ${esc(c.fixture)}</p>`
      : `<p class="fw-meta" style="color:var(--color-text-warning)">fixture: — &middot; the round you write the sentence is the round you write the fixture</p>`;
    const acts = hasFx
      ? [
          stagedButton(root, "Confirm", `confirm criterion ${c.id}`, "check"),
          stagedButton(root, "Make descriptive", `make criterion ${c.id} descriptive`, "file-text"),
          stagedButton(root, "Exclude", `move ${c.id} to excluded`, "circle-minus"),
        ]
      : [
          stagedButton(root, "Add fixture", `add the fixture that proves ${c.id}`, "plus"),
          stagedButton(root, "Make descriptive", `make criterion ${c.id} descriptive`, "file-text"),
          stagedButton(root, "Exclude", `move ${c.id} to excluded`, "circle-minus"),
        ];
    return `<div class="fw-card" data-status="${hasFx ? "proposed" : "clarify"}" data-id="${attr(c.id)}">
      ${dot(hasFx ? "proposed" : "clarify")}
      <div class="fw-card-body">
        <div class="fw-card-head">
          <span class="fw-id">${esc(c.id)}</span>${badge(c.force ?? "MUST")}${hasFx ? "" : badge("needs fixture")}
        </div>
        ${body}${fxLine}
        <div class="fw-acts">${acts.join("")}</div>
      </div>
    </div>`;
  };

  // Profile/binding and excluded are notes, not criteria — chips, not cards.
  // Excluded chips are struck (loudly refused, by design).
  const noteCol = (title, icon, notes, klass) => `<div class="fw-col">
      <div class="fw-col-head"><i class="ti ti-${icon}"></i> ${title} <span class="fw-version">${notes.length}</span></div>
      ${notes.length
        ? `<div class="fw-chips" style="flex-direction:column;align-items:flex-start">${notes.map((n) => `<span class="${klass}" style="white-space:normal">${esc(n)}</span>`).join("")}</div>`
        : `<p class="fw-empty">none yet</p>`}
    </div>`;

  // Contract is the substance — full width for its criterion cards. Profile and
  // excluded are just notes, so they sit below in a compact two-up row.
  const contractSection = `<div class="fw-section">
      <div class="fw-section-title">Contract <span class="fw-section-desc" style="display:inline">${contract.length}</span></div>
      ${contract.length ? contract.map(draftCard).join("") : `<p class="fw-empty">no criteria yet — frame the contract first</p>`}
    </div>`;
  const notesRow = `<div class="fw-board">
    ${noteCol("Profile / binding", "adjustments-horizontal", profile, "fw-chip")}
    ${noteCol("Excluded", "circle-minus", excluded, "fw-chip-out")}
  </div>`;
  const board = contractSection + notesRow;

  // The adopted pattern: open questions are first-class [NEEDS CLARIFICATION]
  // cards — the authoring-time twin of "conformance derived, never asserted".
  const clarifySection = clarifications.length
    ? `<div class="fw-section">
        <div class="fw-section-title">Open questions — [NEEDS CLARIFICATION] <span class="fw-section-desc" style="display:inline">${clarifications.length}</span></div>
        <p class="fw-section-desc">Ambiguity is marked, never assumed. Each resolved here lands (or excludes) a criterion.</p>
        ${clarifications.map((q) => `<div class="fw-card" data-status="clarify" data-id="${attr(q.id ?? "")}">
          ${dot("clarify")}
          <div class="fw-card-body">
            <div class="fw-card-head"><span class="fw-id">${esc(q.id ?? "?")}</span>${q.criterionId ? badge(`blocks ${q.criterionId}`) : ""}</div>
            <p class="fw-section-desc" style="margin:0.1rem 0 0;color:var(--color-text-primary)">${esc(q.question ?? "")}</p>
            <div class="fw-acts">${stagedButton(root, "Resolve", `resolve clarification ${q.id ?? ""}${q.criterionId ? ` (criterion ${q.criterionId})` : ""}`, "message-circle-question")}</div>
          </div>
        </div>`).join("")}
      </div>`
    : "";

  // Ready-state: the done-signal. Not ready ⇒ name what's blocking. Ready ⇒ the
  // one deliberate hand-off to cold review (drafts, human sends).
  const footer = ready
    ? `<div class="fw-section"><p class="fw-empty"><i class="ti ti-circle-check"></i> ${contract.length} proposed criteria &middot; lints clean — ready for review.</p>
        <div class="fw-acts">${actionButton("Send to cold review", `cold-review ${spec}`, "arrow-right")}</div></div>`
    : `<div class="fw-section"><p class="fw-empty">Not ready — ${
        [
          clarifications.length ? `${clarifications.length} open question${clarifications.length === 1 ? "" : "s"}` : "",
          needFixture.length ? `${needFixture.length} criterion${needFixture.length === 1 ? "" : "s"} missing a fixture` : "",
          lintClean ? "" : "lint failing",
        ].filter(Boolean).join(", ")
      }. Resolve these, then send to review.</p></div>`;

  // The staging tray: per-criterion moves queue here and send as one block.
  const traySection = `<div class="fw-section">
      <div class="fw-section-title">Staged actions</div>
      ${stagingTray(root)}
    </div>`;

  return `<div id="${root}" class="felag-widget" data-subject="${attr(spec)}">
    <h2 class="sr-only">${esc(summary)}</h2>
    ${styles(root)}
    ${header}
    ${board}
    ${clarifySection}
    ${traySection}
    ${footer}
    ${stagingScript()}
  </div>`;
}

// Thin dispatcher so future skills stay one-liners (design: renderFelagWidget).
export function renderFelagWidget(kind, model) {
  switch (kind) {
    case "new": case "interview": return renderInterviewWidget(model);
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
