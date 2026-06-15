/**
 * felag "Audit" widget — felag's coverage verb as a work board (Preact + the
 * ext-apps App SDK).
 *
 * audit turns drift into a plan: one TaskProposal per failing gating criterion.
 * This view never shows a bare id — each proposal is joined (server-side) to the
 * human "what": the criterion's parent ITEM title, its readable Gherkin, and its
 * fixtures.
 *   - INLINE: a compact summary — verdict pill + "N open work items" (or
 *     "all clear · N conforming") + the top proposal title(s).
 *   - FULLSCREEN: when there's open work, a work card per proposal grouped by
 *     spec item — the human title, the criterion it concerns (id + item title +
 *     the Gherkin), the why-failing description, its fixtures (id + description),
 *     and click-to-drill its GOVERNANCE HISTORY (proposed → ratified, by whom).
 *     When felag-core CONFORMS (0 proposals), a healthy empty state instead: the
 *     conformance verdict + counts AND a recent-governance-activity log (newest
 *     ratifications first across all criteria) — the board reads healthy, never
 *     barren.
 *
 * Data comes from the felag_audit_view tool result (structuredContent), enriched
 * server-side with items / fixtures / history, and refreshes via callServerTool.
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { App } from '@modelcontextprotocol/ext-apps';

interface HistoryEntry {
  at: string; to: string; requestedBy: string; accepted: boolean; outcome: string;
  acks: { implementer: string; decision: string }[];
}
interface Proposal {
  specItemRef: string;
  criterionId: string;
  title: string;
  description: string;
  attribution: string;
  at: string;
  // enriched server-side from the criterion records:
  itemId: string;
  gherkin: string;
  fixtures: string[];
}
interface Report {
  advisory: { criterionId: string; verdict: string }[];
  conformanceVersion: string;
  disputed: string[];
  failing: string[];
  implementation: string;
  verdict: string;
  waived: string[];
}
interface AuditModel {
  report: Report;
  proposals: Proposal[];
  items?: Record<string, { title: string; body: string }>;
  fixtures?: Record<string, { description: string; format: string }>;
  history?: Record<string, HistoryEntry[]>;
}

// One recent governance act flattened across criteria — for the healthy log.
interface RecentAct extends HistoryEntry { critId: string; }

const VERDICT_COLOR: Record<string, string> = {
  conforms: '#16a34a', 'conforms-with-waivers': '#a78bfa', drifts: '#f87171', unverified: '#64748b',
};

const app = new App({ name: 'felag-audit', version: '1.0.0' });

function fmtDate(iso: string): string {
  if (!iso) return '';
  // YYYY-MM-DD from the ISO stamp — no Date() needed (stable across hosts).
  return iso.slice(0, 10);
}

function VerdictPill({ verdict }: { verdict: string }) {
  const c = VERDICT_COLOR[verdict] ?? '#64748b';
  return (
    <span style={{ background: c, color: '#0b1220', fontWeight: 700, fontSize: '12px',
      padding: '2px 10px', borderRadius: '999px' }}>{verdict}</span>
  );
}

/** A small labelled count chip — the conformance ledger at a glance. */
function CountChip({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span class="row" style={{ marginRight: '12px' }}>
      <b style={{ color }}>{n}</b> {label}
    </span>
  );
}

/** The conformance counts strip — failing / waived / disputed / conforming. */
function CountsStrip({ report }: { report: Report }) {
  const failing = report.failing?.length ?? 0;
  const waived = report.waived?.length ?? 0;
  const disputed = report.disputed?.length ?? 0;
  // "conforming" = gating criteria that pass = advisory excluded; we don't get
  // a total here, so we report the actionable buckets + advisory count.
  const advisory = report.advisory?.length ?? 0;
  return (
    <span class="row">
      <CountChip n={failing} label="failing" color={failing ? '#f87171' : '#16a34a'} />
      <CountChip n={waived} label="waived" color={waived ? '#a78bfa' : '#64748b'} />
      <CountChip n={disputed} label="disputed" color={disputed ? '#f87171' : '#64748b'} />
      {advisory ? <CountChip n={advisory} label="advisory" color="#94a3b8" /> : null}
    </span>
  );
}

/** The governance lifecycle of one criterion, oldest → newest. Ported verbatim
 * from the board widget — the "review historical info" surface. */
function History({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) {
    return <p class="row" style={{ fontSize: '12px', opacity: 0.7, margin: '6px 0 0' }}>No governance acts recorded.</p>;
  }
  return (
    <div style={{ margin: '8px 0 0' }}>
      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
        Governance history
      </div>
      {entries.map((e, i) => {
        const ok = e.accepted;
        return (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '3px 0',
            borderLeft: `2px solid ${ok ? '#16a34a' : '#f87171'}`, paddingLeft: '8px', marginBottom: '3px' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8', minWidth: '74px' }}>{fmtDate(e.at)}</span>
            <span style={{ fontSize: '12px' }}>
              <b style={{ color: ok ? '#4ade80' : '#f87171' }}>{e.outcome}</b>
              {' → '}<span style={{ color: '#e2e8f0' }}>{e.to}</span>
              <span class="row" style={{ opacity: 0.7 }}> · by {e.requestedBy}</span>
              {e.acks.length ? (
                <span class="row" style={{ opacity: 0.7 }}>
                  {' · acks: '}{e.acks.map((a) => `${a.implementer} (${a.decision})`).join(', ')}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The drill-down detail for one work proposal: the criterion it concerns (the
 * parent item's body + the readable Gherkin), its fixtures, and the criterion's
 * governance history. */
function ProposalDetail({ p, model }: { p: Proposal; model: AuditModel }) {
  const item = model.items?.[p.itemId];
  const fxMap = model.fixtures ?? {};
  const history = model.history?.[p.criterionId] ?? [];
  return (
    <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px', margin: '2px 0 10px' }}>
      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
        Why it's failing
      </div>
      <p class="row" style={{ fontSize: '12px', margin: '0 0 8px', lineHeight: 1.5, color: '#cbd5e1' }}>{p.description}</p>

      {item?.body ? (
        <>
          <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
            Item — {item.title}
          </div>
          <p class="row" style={{ fontSize: '12px', margin: '0 0 8px', lineHeight: 1.5 }}>{item.body}</p>
        </>
      ) : null}

      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
        Scenario
      </div>
      <pre style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        margin: '0 0 8px', color: '#cbd5e1' }}>{p.gherkin || '(no scenario)'}</pre>

      {p.fixtures.length ? (
        <div style={{ margin: '8px 0 0' }}>
          <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
            Fixtures ({p.fixtures.length})
          </div>
          {p.fixtures.map((fid) => {
            const fx = fxMap[fid];
            return (
              <div key={fid} style={{ fontSize: '12px', padding: '2px 0' }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', color: '#7dd3fc' }}>{fid}</span>
                {fx ? <span class="row" style={{ opacity: 0.8 }}> — {fx.description}</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <History entries={history} />
    </div>
  );
}

/** One work card: the human title, the criterion it concerns (id + parent item
 * title), a Gherkin preview, and click-to-drill the full detail. */
function ProposalCard({ p, model, open, onToggle }: { p: Proposal; model: AuditModel; open: boolean; onToggle: () => void }) {
  const item = model.items?.[p.itemId];
  const histCount = model.history?.[p.criterionId]?.length ?? 0;
  const scenario = (p.gherkin || '').replace(/\s+/g, ' ').trim();
  const preview = scenario.length > 140 ? scenario.slice(0, 139) + '…' : scenario;
  return (
    <div style={{ borderLeft: '3px solid #f87171', padding: '6px 0 6px 10px', margin: '0 0 8px' }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: '#64748b', fontSize: '11px', width: '10px' }}>{open ? '▾' : '▸'}</span>
          <span style={{ background: '#f87171', color: '#0b1220', fontWeight: 700, fontSize: '11px',
            padding: '1px 8px', borderRadius: '999px' }}>work</span>
          <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>{p.title}</span>
        </div>
        <div class="row" style={{ fontSize: '11px', margin: '3px 0 0 18px' }}>
          criterion <span style={{ fontFamily: 'ui-monospace, monospace', color: '#94a3b8' }}>{p.criterionId}</span>
          {item ? <span> · {item.title}</span> : null}
          {p.fixtures.length ? <span style={{ opacity: 0.7 }}> · {p.fixtures.length} fx</span> : null}
          {histCount ? <span style={{ opacity: 0.7 }}> · {histCount} gov</span> : null}
        </div>
        {preview ? (
          <div style={{ fontSize: '13px', color: '#cbd5e1', margin: '3px 0 0 18px', lineHeight: 1.45 }}>{preview}</div>
        ) : null}
      </div>
      {open ? <div style={{ margin: '6px 0 0 18px' }}><ProposalDetail p={p} model={model} /></div> : null}
    </div>
  );
}

/** Proposals grouped by their spec item (the unit audit emits them under), in
 * first-seen order — so the plan reads top-to-bottom of the spec. */
function PlanSections({ model, openId, setOpenId }:
  { model: AuditModel; openId: string | null; setOpenId: (id: string | null) => void }) {
  const groups: { ref: string; itemId: string; props: Proposal[] }[] = [];
  const idx: Record<string, number> = {};
  for (const p of model.proposals) {
    const ref = p.specItemRef || '(no item)';
    if (idx[ref] === undefined) { idx[ref] = groups.length; groups.push({ ref, itemId: p.itemId, props: [] }); }
    groups[idx[ref]].props.push(p);
  }
  return (
    <div>
      {groups.map((g) => {
        const item = model.items?.[g.itemId];
        return (
          <div key={g.ref} style={{ marginBottom: '18px' }}>
            <h2>
              {item?.title ?? g.ref}
              <span class="row" style={{ fontWeight: 400 }}> · {g.props.length} open</span>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: '#475569', marginLeft: '7px' }}>{g.ref}</span>
            </h2>
            {g.props.map((p) => (
              <ProposalCard key={p.criterionId} p={p} model={model} open={openId === p.criterionId}
                onToggle={() => setOpenId(openId === p.criterionId ? null : p.criterionId)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Flatten the per-criterion governance histories into one newest-first log —
 * the spine of the healthy empty state (the "work board" still has news even
 * with no open work). */
function recentActs(history: Record<string, HistoryEntry[]> | undefined, limit: number): RecentAct[] {
  const all: RecentAct[] = [];
  for (const critId of Object.keys(history ?? {})) {
    for (const e of history![critId]) all.push({ ...e, critId });
  }
  all.sort((a, b) => b.at.localeCompare(a.at));
  return all.slice(0, limit);
}

/** The healthy empty state: conformance verdict + counts, then a recent
 * governance-activity log so the board reads alive, not barren. */
function HealthyState({ model, full }: { model: AuditModel; full: boolean }) {
  const acts = recentActs(model.history, full ? 12 : 3);
  return (
    <div>
      <p class="status" style={{ color: '#4ade80' }}>
        ✓ All clear — {model.report.implementation} has 0 open work items.
      </p>
      <p class="sub" style={{ margin: '4px 0 12px' }}>
        Every gating criterion conforms ({model.report.conformanceVersion}). Nothing to file.{' '}
        <CountsStrip report={model.report} />
      </p>
      {full ? (
        <div style={{ marginTop: '4px' }}>
          <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '6px' }}>
            Recent governance activity
          </div>
          {acts.length ? acts.map((a, i) => {
            const ok = a.accepted;
            return (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '4px 0',
                borderLeft: `2px solid ${ok ? '#16a34a' : '#f87171'}`, paddingLeft: '8px', marginBottom: '3px' }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8', minWidth: '74px' }}>{fmtDate(a.at)}</span>
                <span style={{ fontSize: '12px' }}>
                  <b style={{ color: ok ? '#4ade80' : '#f87171' }}>{a.outcome}</b>
                  {' → '}<span style={{ color: '#e2e8f0' }}>{a.to}</span>
                  {' · '}<span style={{ fontFamily: 'ui-monospace, monospace', color: '#7dd3fc' }}>{a.critId}</span>
                  <span class="row" style={{ opacity: 0.7 }}> · by {a.requestedBy}</span>
                </span>
              </div>
            );
          }) : <p class="row" style={{ fontSize: '12px', opacity: 0.7 }}>No governance acts recorded yet.</p>}
        </div>
      ) : null}
    </div>
  );
}

function Widget() {
  const [model, setModel] = useState<AuditModel | null>(null);
  const [mode, setMode] = useState<string>('inline');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    app.ontoolresult = (r: { structuredContent?: unknown }) => {
      if (r.structuredContent) setModel(r.structuredContent as AuditModel);
    };
    app.onhostcontextchanged = () => setMode((app.getHostContext() as { displayMode?: string }).displayMode ?? 'inline');
    app.connect().then(() => setMode((app.getHostContext() as { displayMode?: string }).displayMode ?? 'inline'));
  }, []);

  async function setDisplay(m: 'inline' | 'fullscreen') {
    try { await app.requestDisplayMode({ mode: m }); } catch { /* host may refuse */ }
  }
  async function refresh() {
    setBusy(true);
    try {
      const r = (await app.callServerTool({ name: 'felag_audit_view', arguments: {} })) as { structuredContent?: unknown };
      if (r.structuredContent) setModel(r.structuredContent as AuditModel);
    } finally { setBusy(false); }
  }

  if (!model) return <div class="card"><h1>🪢 felag audit</h1><p class="status">running the audit…</p></div>;

  const full = mode === 'fullscreen';
  const proposals = model.proposals ?? [];
  const open = proposals.length;
  const verdict = model.report?.verdict ?? 'unverified';

  return (
    <div class="card" style={full ? { maxWidth: 'none' } : {}}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <h1>🪢 felag audit <span class="row" style={{ fontSize: '13px' }}>{model.report?.implementation}</span></h1>
        <VerdictPill verdict={verdict} />
      </div>

      {!full ? (
        <div>
          {open ? (
            <div>
              <p class="status" style={{ margin: '8px 0 4px' }}>
                {open} open work item{open === 1 ? '' : 's'}
              </p>
              <div style={{ margin: '2px 0 4px' }}>
                {proposals.slice(0, 2).map((p) => (
                  <div key={p.criterionId} class="row" style={{ fontSize: '12px', color: '#cbd5e1', padding: '1px 0' }}>
                    · {p.title}
                  </div>
                ))}
                {open > 2 ? <div class="row" style={{ fontSize: '12px', opacity: 0.7 }}>… and {open - 2} more</div> : null}
              </div>
            </div>
          ) : (
            <p class="status" style={{ color: '#4ade80', margin: '8px 0 4px' }}>
              ✓ all clear · 0 open work
            </p>
          )}
          <p class="sub" style={{ margin: '6px 0 6px', fontSize: '12px' }}>
            <CountsStrip report={model.report} />
          </p>
          <div style={{ marginTop: '10px' }}>
            <button onClick={() => setDisplay('fullscreen')}>{open ? 'expand to plan →' : 'expand →'}</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      ) : (
        <div>
          {open ? (
            <>
              <p class="sub" style={{ margin: '8px 0 10px' }}>
                {open} proposed work item{open === 1 ? '' : 's'} — one per failing gating criterion, grouped by spec item.
                Each card pairs the criterion id with its item + readable scenario; click a card for its fixtures + governance history.{' '}
                <CountsStrip report={model.report} />
              </p>
              <PlanSections model={model} openId={openId} setOpenId={setOpenId} />
            </>
          ) : (
            <HealthyState model={model} full />
          )}
          <div style={{ position: 'sticky', bottom: 0, paddingTop: '8px', background: '#111c33' }}>
            <button onClick={() => setDisplay('inline')}>← collapse</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

render(<Widget />, document.getElementById('root')!);
