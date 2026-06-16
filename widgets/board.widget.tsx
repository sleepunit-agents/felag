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
interface ProductMember {
  spec: string;
  version: string;
  verdict: string; // conforms | drifts | unverified
  description: string;
  role: 'product' | 'module';
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
  // Composition (Phase 5): when this spec `requires` others, it's a product —
  // `members` are its immediate pieces (each with its resolved verdict), and the
  // board shows a product tier above (or instead of) the root's own contracts.
  project?: string;
  members?: ProductMember[];
  isProduct?: boolean;
  productVerdict?: string; // rolled up over the closure
  closureErrors?: { code: string; spec: string; detail: string }[];
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
  conforms: '#16a34a', 'conforms-with-waivers': '#a78bfa', drifts: '#f87171',
  unverified: '#64748b', incomplete: '#f87171',
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
    return <p class="row detail-sec" style={{ fontSize: '12px', opacity: 0.7 }}>No governance acts recorded.</p>;
  }
  return (
    <div class="detail-sec">
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
    <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px 14px', margin: '2px 0 10px' }}>
      {item ? (
        <p class="desc" style={{ margin: '0 0 4px' }}>{item.body}</p>
      ) : null}

      <div class="detail-sec">
        <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
          Scenario
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, color: '#cbd5e1' }}>{c.text || '(no scenario)'}</pre>
      </div>

      {c.fixtures.length ? (
        <div class="detail-sec">
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
          <div class="desc" style={{ margin: '3px 0 0 18px' }}>{preview}</div>
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
    <div class="section">
      <h2>{ct.id} <span class="row" style={{ fontWeight: 400 }}>· {conf}/{ct.criteria.length} conforming</span></h2>
      <p class="desc" style={{ margin: '0 0 12px' }}>{ct.description}</p>
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

/** One member of a product — a required spec, shown by name@version + its
 * rolled-up verdict + description. Clicking drills into that member's own board
 * (which may itself be a product). This is the recursive tier. */
function MemberCard({ m, onDrill }: { m: ProductMember; onDrill: () => void }) {
  const c = VERDICT_COLOR[m.verdict] ?? '#64748b';
  return (
    <div onClick={onDrill} style={{ cursor: 'pointer', borderLeft: `3px solid ${c}`, padding: '8px 0 8px 12px', margin: '0 0 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '14px' }}>{m.spec}</span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#7dd3fc' }}>@{m.version}</span>
        <span style={{ background: c, color: '#0b1220', fontWeight: 700, fontSize: '11px', padding: '1px 8px', borderRadius: '999px' }}>{m.verdict}</span>
        {m.role === 'product' ? (
          <span style={{ border: '1px solid #334155', color: '#94a3b8', fontWeight: 600, fontSize: '10px', padding: '1px 6px', borderRadius: '6px' }}>product</span>
        ) : null}
        <span class="row" style={{ fontSize: '11px', opacity: 0.5 }}>→ drill in</span>
      </div>
      {m.description ? <div class="desc" style={{ margin: '3px 0 0' }}>{m.description}</div> : null}
    </div>
  );
}

/** The product tier — a product's immediate `requires`, each a drillable member.
 * The product conforms only when every piece does. */
function ProductTier({ model, onDrill }: { model: StatusModel; onDrill: (spec: string) => void }) {
  const n = model.members?.length ?? 0;
  return (
    <div class="section">
      <h2>Composed of <span class="row" style={{ fontWeight: 400 }}>· {n} {n === 1 ? 'piece' : 'pieces'}</span></h2>
      <p class="desc" style={{ margin: '0 0 12px' }}>
        This product requires these specs at pinned versions — drill into any to see its board. The product conforms only when every piece does.
      </p>
      {model.members?.map((m) => <MemberCard key={m.spec} m={m} onDrill={() => onDrill(m.spec)} />)}
      {model.closureErrors?.length ? (
        <p class="row" style={{ color: '#f87171', fontSize: '12px', marginTop: '8px' }}>
          ⚠ {model.closureErrors.map((e) => `${e.code}: ${e.detail}`).join('; ')}
        </p>
      ) : null}
    </div>
  );
}

function Widget() {
  const [model, setModel] = useState<StatusModel | null>(null);
  const [mode, setMode] = useState<string>('inline');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Drill navigation: the stack of project names visited (product → member → …),
  // so "← back" returns to the parent product.
  const [nav, setNav] = useState<string[]>([]);

  useEffect(() => {
    app.ontoolresult = (r: { structuredContent?: unknown }) => {
      const sc = r.structuredContent as StatusModel | undefined;
      if (sc) {
        setModel(sc);
        setNav((prev) => (prev.length ? prev : [sc.project ?? sc.name]));
      }
    };
    app.onhostcontextchanged = () => setMode((app.getHostContext() as { displayMode?: string }).displayMode ?? 'inline');
    app.connect().then(() => setMode((app.getHostContext() as { displayMode?: string }).displayMode ?? 'inline'));
  }, []);

  async function setDisplay(m: 'inline' | 'fullscreen') {
    try { await app.requestDisplayMode({ mode: m }); } catch { /* host may refuse */ }
  }
  async function fetchProject(project?: string) {
    setBusy(true);
    setOpenId(null);
    try {
      const r = (await app.callServerTool({
        name: 'felag_board',
        arguments: project ? { project } : {},
      })) as { structuredContent?: unknown };
      if (r.structuredContent) setModel(r.structuredContent as StatusModel);
    } finally { setBusy(false); }
  }
  const refresh = () => fetchProject(model?.project);
  const drill = (spec: string) => { setNav((n) => [...n, spec]); fetchProject(spec); };
  const back = () => {
    const n = nav.slice(0, -1);
    setNav(n);
    fetchProject(n[n.length - 1]);
  };

  if (!model) return <div class="card"><h1>🪢 felag board</h1><p class="status">loading the board…</p></div>;

  const full = mode === 'fullscreen';
  const isProduct = !!model.isProduct;
  const headline = isProduct ? (model.productVerdict ?? model.verdict) : model.verdict;
  const canBack = nav.length > 1;

  return (
    <div class="card" style={full ? { maxWidth: 'none' } : {}}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <h1>🪢 {model.name} <span class="row" style={{ fontSize: '13px' }}>{model.version}</span></h1>
        <VerdictPill verdict={headline} />
      </div>
      {canBack ? (
        <p class="row" style={{ fontSize: '12px', margin: '2px 0 0' }}>
          <span style={{ cursor: 'pointer', color: '#7dd3fc' }} onClick={back}>← {nav[nav.length - 2]}</span>
          <span style={{ opacity: 0.5 }}> / {model.name}</span>
        </p>
      ) : null}

      {!full ? (
        <div>
          <p class="sub" style={{ margin: '8px 0 6px' }}>
            {isProduct ? (
              <span class="row"><b>{model.members?.length}</b> pieces · rolled up{' '}
                <b style={{ color: VERDICT_COLOR[headline] ?? '#94a3b8' }}>{headline}</b></span>
            ) : (
              <CountsStrip counts={model.counts} />
            )}
          </p>
          <div style={{ marginTop: '12px' }}>
            <button onClick={() => setDisplay('fullscreen')}>expand to board →</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      ) : (
        <div>
          {isProduct ? (
            <>
              <p class="sub" style={{ margin: '8px 0 10px' }}>
                {model.name} as a product — its required pieces, each drillable into its own board.
              </p>
              <ProductTier model={model} onDrill={drill} />
              {model.contracts.length ? (
                <div>
                  <h2>Own contracts <span class="row" style={{ fontWeight: 400 }}>· this spec's direct criteria</span></h2>
                  {model.contracts.map((ct) => (
                    <ContractSection key={ct.id} ct={ct} model={model} openId={openId} setOpenId={setOpenId} />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p class="sub" style={{ margin: '8px 0 10px' }}>
                The spec as a board — criteria grouped by item, each card its readable scenario; click a card for its fixtures + governance history.{' '}
                <CountsStrip counts={model.counts} />
              </p>
              {model.contracts.map((ct) => (
                <ContractSection key={ct.id} ct={ct} model={model} openId={openId} setOpenId={setOpenId} />
              ))}
            </>
          )}
          <div style={{ position: 'sticky', bottom: 0, paddingTop: '8px', background: '#111c33' }}>
            {canBack ? <button onClick={back}>← back</button> : null}
            <button onClick={() => setDisplay('inline')}>← collapse</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

render(<Widget />, document.getElementById('root')!);
