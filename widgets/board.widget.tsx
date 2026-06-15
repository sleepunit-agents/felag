/**
 * felag "Board" widget — the flagship felag widget (Preact + ext-apps App SDK).
 *
 * Renders the felag StatusModel (spec-state ⋈ conformance) as a board you can
 * actually read and govern from — not a wall of opaque ids:
 *   - INLINE: a compact summary — spec name, verdict pill, counts strip.
 *   - FULLSCREEN: the full board. Criteria are grouped by their parent ITEM
 *     (the human "what"), every card shows its readable Gherkin scenario, and
 *     clicking a card drills into a detail panel — the item's full description,
 *     its fixtures, and its GOVERNANCE HISTORY (proposed → ratified, when, by
 *     whom, the acks). That's the "what is this / show me its history" answer.
 *
 * Data comes from the felag_board tool result (structuredContent), enriched
 * server-side with items / fixtures / history, and refreshes via callServerTool.
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { App } from '@modelcontextprotocol/ext-apps';

type CritStatus =
  | 'conforming' | 'drifting' | 'waived' | 'unverified' | 'proposed'
  | 'descriptive' | 'deprecated' | 'disputed' | 'in-flight' | 'blocked' | 'upcoming';

interface CritView {
  id: string;
  contractId?: string;
  itemId: string;
  force: string;
  state: string;
  status: CritStatus;
  text: string;        // the Gherkin scenario — felag's readable form
  fixtures: string[];  // fixture ids
}
interface Contract { id: string; description: string; criteria: CritView[]; }
interface HistoryEntry {
  at: string; to: string; requestedBy: string; accepted: boolean; outcome: string;
  acks: { implementer: string; decision: string }[];
}
interface StatusModel {
  name: string;
  version: string;
  verdict: string;
  scope: { kind: string; id?: string };
  counts: Record<string, number>;
  contracts: Contract[];
  items?: Record<string, { title: string; body: string }>;
  fixtures?: Record<string, { description: string; format: string }>;
  history?: Record<string, HistoryEntry[]>;
}

// Pill color per derived status. conforming=green; drifting/blocked=amber/red;
// proposed=blue; descriptive/deprecated/unverified=grey/muted.
const STATUS_COLOR: Record<string, string> = {
  conforming: '#16a34a', 'in-flight': '#38bdf8', blocked: '#f87171', upcoming: '#94a3b8',
  drifting: '#fbbf24', waived: '#a78bfa', proposed: '#60a5fa', descriptive: '#64748b',
  disputed: '#f87171', deprecated: '#475569', unverified: '#64748b',
};
const STATUS_LABEL: Record<string, string> = {
  conforming: 'Conforming', 'in-flight': 'In flight', blocked: 'Blocked', upcoming: 'Upcoming',
  drifting: 'Drifting', waived: 'Waived', proposed: 'Proposed', descriptive: 'Descriptive',
  disputed: 'Disputed', deprecated: 'Deprecated', unverified: 'Unverified',
};
const STATUS_ORDER: string[] = [
  'conforming', 'in-flight', 'blocked', 'upcoming', 'drifting',
  'waived', 'proposed', 'descriptive', 'disputed', 'deprecated', 'unverified',
];

const VERDICT_COLOR: Record<string, string> = {
  conforms: '#16a34a', 'conforms-with-waivers': '#a78bfa', drifts: '#f87171', unverified: '#64748b',
};

const app = new App({ name: 'felag-board', version: '1.0.0' });

function fmtDate(iso: string): string {
  if (!iso) return '';
  // YYYY-MM-DD from the ISO stamp — no Date() needed (and stable across hosts).
  return iso.slice(0, 10);
}

function VerdictPill({ verdict }: { verdict: string }) {
  const c = VERDICT_COLOR[verdict] ?? '#64748b';
  return (
    <span style={{ background: c, color: '#0b1220', fontWeight: 700, fontSize: '12px',
      padding: '2px 10px', borderRadius: '999px' }}>{verdict}</span>
  );
}

function StatusPill({ status }: { status: CritStatus }) {
  const c = STATUS_COLOR[status] ?? '#64748b';
  return (
    <span style={{ background: c, color: '#0b1220', fontWeight: 700, fontSize: '11px',
      padding: '1px 8px', borderRadius: '999px' }}>{STATUS_LABEL[status] ?? status}</span>
  );
}

function ForceBadge({ force }: { force: string }) {
  return (
    <span style={{ border: '1px solid #334155', color: '#94a3b8', fontWeight: 600, fontSize: '10px',
      padding: '1px 6px', borderRadius: '6px', fontFamily: 'ui-monospace, monospace' }}>{force.toUpperCase()}</span>
  );
}

function CountsStrip({ counts }: { counts: Record<string, number> }) {
  const parts = STATUS_ORDER.filter((s) => counts[s]);
  if (!parts.length) return <span class="row">no criteria</span>;
  return (
    <span class="row">
      {parts.map((s, i) => (
        <span key={s}>
          {i > 0 ? ' · ' : ''}
          <b style={{ color: STATUS_COLOR[s] }}>{counts[s]}</b> {(STATUS_LABEL[s] ?? s).toLowerCase()}
        </span>
      ))}
    </span>
  );
}

/** The governance lifecycle of one criterion, oldest → newest. */
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

/** The drill-down detail for one criterion: the human description, the full
 * scenario, its fixtures, and its governance history. */
function CritDetail({ c, model }: { c: CritView; model: StatusModel }) {
  const item = model.items?.[c.itemId];
  const fxMap = model.fixtures ?? {};
  const history = model.history?.[c.id] ?? [];
  return (
    <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px', margin: '2px 0 10px' }}>
      {item ? (
        <p class="row" style={{ fontSize: '12px', margin: '0 0 8px', lineHeight: 1.5 }}>{item.body}</p>
      ) : null}

      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
        Scenario
      </div>
      <pre style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        margin: '0 0 8px', color: '#cbd5e1' }}>{c.text || '(no scenario)'}</pre>

      {c.fixtures.length ? (
        <div style={{ margin: '8px 0 0' }}>
          <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
            Fixtures ({c.fixtures.length})
          </div>
          {c.fixtures.map((fid) => {
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

/** One criterion card. Shows the readable scenario (not just the id), and
 * toggles its drill-down detail on click. */
function CritCard({ c, model, open, onToggle }: { c: CritView; model: StatusModel; open: boolean; onToggle: () => void }) {
  const histCount = model.history?.[c.id]?.length ?? 0;
  const scenario = c.text.replace(/\s+/g, ' ').trim();
  const preview = scenario.length > 140 ? scenario.slice(0, 139) + '…' : scenario;
  return (
    <div style={{ borderLeft: `3px solid ${STATUS_COLOR[c.status] ?? '#64748b'}`, padding: '6px 0 6px 10px', margin: '0 0 8px' }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: '#64748b', fontSize: '11px', width: '10px' }}>{open ? '▾' : '▸'}</span>
          <StatusPill status={c.status} />
          <ForceBadge force={c.force} />
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#64748b' }}>{c.id}</span>
          {c.fixtures.length ? <span class="row" style={{ fontSize: '11px', opacity: 0.6 }}>· {c.fixtures.length} fx</span> : null}
          {histCount ? <span class="row" style={{ fontSize: '11px', opacity: 0.6 }}>· {histCount} gov</span> : null}
        </div>
        {preview ? (
          <div style={{ fontSize: '13px', color: '#cbd5e1', margin: '3px 0 0 18px', lineHeight: 1.45 }}>{preview}</div>
        ) : null}
      </div>
      {open ? <div style={{ margin: '6px 0 0 18px' }}><CritDetail c={c} model={model} /></div> : null}
    </div>
  );
}

/** Criteria under one contract, grouped by their parent item (the human "what"). */
function ContractSection({ ct, model, openId, setOpenId }:
  { ct: Contract; model: StatusModel; openId: string | null; setOpenId: (id: string | null) => void }) {
  const conf = ct.criteria.filter((c) => c.status === 'conforming').length;
  // Group by itemId, preserving first-seen order.
  const groups: { itemId: string; crits: CritView[] }[] = [];
  const idx: Record<string, number> = {};
  for (const c of ct.criteria) {
    if (idx[c.itemId] === undefined) { idx[c.itemId] = groups.length; groups.push({ itemId: c.itemId, crits: [] }); }
    groups[idx[c.itemId]].crits.push(c);
  }
  return (
    <div style={{ marginBottom: '18px' }}>
      <h2>{ct.id} <span class="row" style={{ fontWeight: 400 }}>· {conf}/{ct.criteria.length} conforming</span></h2>
      <p class="row" style={{ fontSize: '12px', margin: '0 0 10px' }}>{ct.description}</p>
      {groups.map((g) => {
        const item = model.items?.[g.itemId];
        return (
          <div key={g.itemId} style={{ margin: '0 0 12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: '0 0 5px' }}>
              {item?.title ?? g.itemId}
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: '#475569', marginLeft: '7px' }}>{g.itemId}</span>
            </div>
            {g.crits.map((c) => (
              <CritCard key={c.id} c={c} model={model} open={openId === c.id}
                onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Widget() {
  const [model, setModel] = useState<StatusModel | null>(null);
  const [mode, setMode] = useState<string>('inline');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    app.ontoolresult = (r: { structuredContent?: unknown }) => {
      if (r.structuredContent) setModel(r.structuredContent as StatusModel);
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
      const r = (await app.callServerTool({ name: 'felag_board', arguments: {} })) as { structuredContent?: unknown };
      if (r.structuredContent) setModel(r.structuredContent as StatusModel);
    } finally { setBusy(false); }
  }

  if (!model) return <div class="card"><h1>🪢 felag board</h1><p class="status">loading the board…</p></div>;

  const full = mode === 'fullscreen';

  return (
    <div class="card" style={full ? { maxWidth: 'none' } : {}}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <h1>🪢 {model.name} <span class="row" style={{ fontSize: '13px' }}>{model.version}</span></h1>
        <VerdictPill verdict={model.verdict} />
      </div>

      {!full ? (
        <div>
          <p class="sub" style={{ margin: '8px 0 6px' }}>
            <CountsStrip counts={model.counts} />
          </p>
          <div style={{ marginTop: '12px' }}>
            <button onClick={() => setDisplay('fullscreen')}>expand to board →</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      ) : (
        <div>
          <p class="sub" style={{ margin: '8px 0 10px' }}>
            The spec as a board — criteria grouped by item, each card its readable scenario; click a card for its fixtures + governance history.{' '}
            <CountsStrip counts={model.counts} />
          </p>
          {model.contracts.map((ct) => (
            <ContractSection key={ct.id} ct={ct} model={model} openId={openId} setOpenId={setOpenId} />
          ))}
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
