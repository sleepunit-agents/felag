/**
 * felag "Board" widget — the flagship felag widget (Preact + ext-apps App SDK).
 *
 * Renders the felag StatusModel (spec-state ⋈ conformance) as a board: every
 * criterion is a card, its status pill the derived column. It changes content by
 * display mode (the unlock): INLINE shows a compact summary — the spec name, the
 * verdict pill, the counts strip; click "expand" → FULLSCREEN shows the full
 * board, per contract, criterion cards with id / force / status pill. Data comes
 * from the felag_board tool result (structuredContent: StatusModel) and can be
 * refreshed live via callServerTool.
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
  text: string;
  fixtures: string[];
}
interface Contract { id: string; description: string; criteria: CritView[]; }
interface StatusModel {
  name: string;
  version: string;
  verdict: string;
  scope: { kind: string; id?: string };
  counts: Record<string, number>;
  contracts: Contract[];
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

function CritCard({ c }: { c: CritView }) {
  return (
    <div style={{ borderLeft: `3px solid ${STATUS_COLOR[c.status] ?? '#64748b'}`,
      padding: '6px 0 6px 10px', margin: '0 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#e2e8f0' }}>{c.id}</span>
        <ForceBadge force={c.force} />
        <StatusPill status={c.status} />
      </div>
    </div>
  );
}

function Widget() {
  const [model, setModel] = useState<StatusModel | null>(null);
  const [mode, setMode] = useState<string>('inline');
  const [busy, setBusy] = useState(false);

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
          <p class="sub" style={{ margin: '8px 0 6px' }}>
            The spec as a board — every criterion a card, its column derived.{' '}
            <CountsStrip counts={model.counts} />
          </p>
          {model.contracts.map((ct) => {
            const conf = ct.criteria.filter((c) => c.status === 'conforming').length;
            return (
              <div key={ct.id} style={{ marginBottom: '14px' }}>
                <h2>{ct.id} <span class="row" style={{ fontWeight: 400 }}>· {conf}/{ct.criteria.length} conforming</span></h2>
                <p class="row" style={{ fontSize: '12px', margin: '0 0 8px' }}>{ct.description}</p>
                {ct.criteria.map((c) => <CritCard key={c.id} c={c} />)}
              </div>
            );
          })}
          <div style={{ position: 'sticky', bottom: 0, paddingTop: '8px' }}>
            <button onClick={() => setDisplay('inline')}>← collapse</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

render(<Widget />, document.getElementById('root')!);
