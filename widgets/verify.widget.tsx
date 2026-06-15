/**
 * felag "verify" widget — the conformance-report widget (Preact + ext-apps SDK).
 *
 * Renders the felag ConformanceReport (felag-ts ⊨ felag-core) as a report you
 * can actually read — not a wall of opaque criterion ids:
 *   - INLINE: a compact summary — the verdict pill, "N/N criteria passing", and
 *     a counts strip (failing / waived / disputed / advisory when any).
 *   - FULLSCREEN: the full report. Every gating criterion is grouped by its
 *     CONTRACT, each card shows its parent item title + readable Gherkin
 *     scenario, and clicking a card drills into the scenario, its fixtures (with
 *     descriptions), the EVIDENCE (the VerificationRecord verdict + evidence
 *     text + fixture + timestamp that proves it), and the criterion's GOVERNANCE
 *     HISTORY. Failing / disputed lead at top in red; a clean conforming report
 *     reads as a satisfying green audit, not an empty page.
 *
 * Data comes from the felag_verify_view tool result (structuredContent),
 * enriched server-side, and refreshes via callServerTool.
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { App } from '@modelcontextprotocol/ext-apps';

type Bucket = 'failing' | 'waived' | 'disputed' | 'passing' | 'advisory';
type Verdict = 'pass' | 'fail' | 'unverifiable';

interface EvidenceRecord {
  fixtureId?: string;
  verdict: Verdict;
  evidence: string;
  runner: string;
  at: string;
  attribution: string;
  stale: boolean;
}
interface EnrichedCriterion {
  id: string;
  bucket: Bucket;
  itemId: string;
  itemTitle: string;
  contractId?: string;
  contractDescription?: string;
  force: string;
  state: string;
  cls: string;
  gherkin: string;
  fixtures: string[];
  evidence: EvidenceRecord[];
}
interface HistoryEntry {
  at: string; to: string; requestedBy: string; accepted: boolean; outcome: string;
  acks: { implementer: string; decision: string }[];
}
interface Contract { id: string; description: string; }
interface Report {
  advisory: { criterionId: string; verdict: Verdict }[];
  conformanceVersion: string;
  disputed: string[];
  failing: string[];
  implementation: string;
  verdict: string;
  waived: string[];
}
interface VerifyModel {
  report: Report;
  implementation: string;
  conformanceVersion: string;
  verifiedAt: string;
  criteria: EnrichedCriterion[];
  contracts: Contract[];
  passingCount: number;
  totalActive: number;
  counts: Record<string, number>;
  items?: Record<string, { title: string; body: string }>;
  fixtures?: Record<string, { description: string; format: string }>;
  history?: Record<string, HistoryEntry[]>;
}

// The report verdict pill — same palette as the board.
const VERDICT_COLOR: Record<string, string> = {
  conforms: '#16a34a', 'conforms-with-waivers': '#a78bfa', drifts: '#f87171', unverified: '#64748b',
};

// One bucket = one display status; reuse the board's status colors so a failing
// criterion is the same red the board shows it as.
const BUCKET_COLOR: Record<Bucket, string> = {
  failing: '#f87171', disputed: '#f87171', waived: '#a78bfa', advisory: '#60a5fa', passing: '#16a34a',
};
const BUCKET_LABEL: Record<Bucket, string> = {
  failing: 'Failing', disputed: 'Disputed', waived: 'Waived', advisory: 'Advisory', passing: 'Passing',
};
// Lead with the red buckets, then waived/advisory, then the green wall.
const BUCKET_ORDER: Bucket[] = ['failing', 'disputed', 'waived', 'advisory', 'passing'];

// Per-evidence verdict color.
const VERDICT_DOT: Record<Verdict, string> = {
  pass: '#16a34a', fail: '#f87171', unverifiable: '#fbbf24',
};

const app = new App({ name: 'felag-verify', version: '1.0.0' });

function fmtDate(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function VerdictPill({ verdict }: { verdict: string }) {
  const c = VERDICT_COLOR[verdict] ?? '#64748b';
  return (
    <span style={{ background: c, color: '#0b1220', fontWeight: 700, fontSize: '12px',
      padding: '2px 10px', borderRadius: '999px' }}>{verdict}</span>
  );
}

function BucketPill({ bucket }: { bucket: Bucket }) {
  const c = BUCKET_COLOR[bucket];
  return (
    <span style={{ background: c, color: '#0b1220', fontWeight: 700, fontSize: '11px',
      padding: '1px 8px', borderRadius: '999px' }}>{BUCKET_LABEL[bucket]}</span>
  );
}

function ForceBadge({ force }: { force: string }) {
  return (
    <span style={{ border: '1px solid #334155', color: '#94a3b8', fontWeight: 600, fontSize: '10px',
      padding: '1px 6px', borderRadius: '6px', fontFamily: 'ui-monospace, monospace' }}>{force.toUpperCase()}</span>
  );
}

/** The report's headline counts — failing/waived/disputed/advisory, only the
 * non-zero ones. */
function CountsStrip({ counts }: { counts: Record<string, number> }) {
  const order: { key: string; label: string; color: string }[] = [
    { key: 'failing', label: 'failing', color: BUCKET_COLOR.failing },
    { key: 'disputed', label: 'disputed', color: BUCKET_COLOR.disputed },
    { key: 'waived', label: 'waived', color: BUCKET_COLOR.waived },
    { key: 'advisory', label: 'advisory', color: BUCKET_COLOR.advisory },
  ];
  const parts = order.filter((o) => counts[o.key]);
  if (!parts.length) return <span class="row" style={{ color: '#4ade80' }}>nothing outstanding</span>;
  return (
    <span class="row">
      {parts.map((o, i) => (
        <span key={o.key}>
          {i > 0 ? ' · ' : ''}
          <b style={{ color: o.color }}>{counts[o.key]}</b> {o.label}
        </span>
      ))}
    </span>
  );
}

/** The governance lifecycle of one criterion, oldest → newest. (Ported from the
 * board widget essentially verbatim.) */
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

/** The evidence ledger for one criterion: the VerificationRecords that prove
 * (or refute) it. This is the "why did it pass?" answer the bare report omits. */
function Evidence({ records }: { records: EvidenceRecord[] }) {
  if (!records.length) {
    return (
      <p class="row" style={{ fontSize: '12px', opacity: 0.7, margin: '6px 0 0' }}>
        No verification records — gating but unverified.
      </p>
    );
  }
  return (
    <div style={{ margin: '8px 0 0' }}>
      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
        Evidence ({records.length})
      </div>
      {records.map((r, i) => (
        <div key={i} style={{ borderLeft: `2px solid ${VERDICT_DOT[r.verdict] ?? '#64748b'}`,
          paddingLeft: '8px', margin: '0 0 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
            <b style={{ color: VERDICT_DOT[r.verdict] ?? '#94a3b8' }}>{r.verdict}</b>
            {r.fixtureId ? (
              <span style={{ fontFamily: 'ui-monospace, monospace', color: '#7dd3fc' }}>{r.fixtureId}</span>
            ) : null}
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8' }}>{fmtDate(r.at)}</span>
            {r.stale ? (
              <span style={{ background: '#fbbf24', color: '#0b1220', fontWeight: 700, fontSize: '10px',
                padding: '0 6px', borderRadius: '6px' }}>stale hash · ignored</span>
            ) : null}
          </div>
          <div style={{ fontSize: '12px', color: '#cbd5e1', margin: '2px 0 0', lineHeight: 1.45 }}>{r.evidence}</div>
          <div class="row" style={{ fontSize: '11px', opacity: 0.6 }}>{r.runner} · {r.attribution}</div>
        </div>
      ))}
    </div>
  );
}

/** The drill-down detail for one criterion: the full scenario, its fixtures
 * (with descriptions), the evidence that proves it, and its governance history. */
function CritDetail({ c, model }: { c: EnrichedCriterion; model: VerifyModel }) {
  const item = model.items?.[c.itemId];
  const fxMap = model.fixtures ?? {};
  const history = model.history?.[c.id] ?? [];
  return (
    <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px', margin: '2px 0 10px' }}>
      {item?.body ? (
        <p class="row" style={{ fontSize: '12px', margin: '0 0 8px', lineHeight: 1.5 }}>{item.body}</p>
      ) : null}

      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
        Scenario
      </div>
      <pre style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        margin: '0 0 8px', color: '#cbd5e1' }}>{c.gherkin || '(no scenario)'}</pre>

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

      <Evidence records={c.evidence} />
      <History entries={history} />
    </div>
  );
}

/** One criterion card. Shows the readable scenario (not just the id) + its
 * verdict-defining bucket, and toggles its drill-down detail on click. */
function CritCard({ c, model, open, onToggle }:
  { c: EnrichedCriterion; model: VerifyModel; open: boolean; onToggle: () => void }) {
  const histCount = model.history?.[c.id]?.length ?? 0;
  const passes = c.evidence.filter((e) => e.verdict === 'pass' && !e.stale).length;
  const scenario = c.gherkin.replace(/\s+/g, ' ').trim();
  const preview = scenario.length > 140 ? scenario.slice(0, 139) + '…' : scenario;
  return (
    <div style={{ borderLeft: `3px solid ${BUCKET_COLOR[c.bucket]}`, padding: '6px 0 6px 10px', margin: '0 0 8px' }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: '#64748b', fontSize: '11px', width: '10px' }}>{open ? '▾' : '▸'}</span>
          <BucketPill bucket={c.bucket} />
          <ForceBadge force={c.force} />
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#64748b' }}>{c.id}</span>
          {c.evidence.length ? (
            <span class="row" style={{ fontSize: '11px', opacity: 0.6 }}>· {passes}/{c.evidence.length} pass</span>
          ) : null}
          {histCount ? <span class="row" style={{ fontSize: '11px', opacity: 0.6 }}>· {histCount} gov</span> : null}
        </div>
        <div style={{ fontSize: '12px', color: '#e2e8f0', margin: '3px 0 0 18px', fontWeight: 600 }}>
          {c.itemTitle}
        </div>
        {preview ? (
          <div style={{ fontSize: '13px', color: '#cbd5e1', margin: '2px 0 0 18px', lineHeight: 1.45 }}>{preview}</div>
        ) : null}
      </div>
      {open ? <div style={{ margin: '6px 0 0 18px' }}><CritDetail c={c} model={model} /></div> : null}
    </div>
  );
}

/** All criteria under one contract. Within a contract, red buckets lead. */
function ContractSection({ ct, crits, model, openId, setOpenId }:
  { ct: Contract; crits: EnrichedCriterion[]; model: VerifyModel; openId: string | null; setOpenId: (id: string | null) => void }) {
  const passing = crits.filter((c) => c.bucket === 'passing').length;
  const sorted = [...crits].sort(
    (a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket),
  );
  return (
    <div style={{ marginBottom: '18px' }}>
      <h2>{ct.id} <span class="row" style={{ fontWeight: 400 }}>· {passing}/{crits.length} passing</span></h2>
      <p class="row" style={{ fontSize: '12px', margin: '0 0 10px' }}>{ct.description}</p>
      {sorted.map((c) => (
        <CritCard key={c.id} c={c} model={model} open={openId === c.id}
          onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
      ))}
    </div>
  );
}

function Widget() {
  const [model, setModel] = useState<VerifyModel | null>(null);
  const [mode, setMode] = useState<string>('inline');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    app.ontoolresult = (r: { structuredContent?: unknown }) => {
      if (r.structuredContent) setModel(r.structuredContent as VerifyModel);
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
      const r = (await app.callServerTool({ name: 'felag_verify_view', arguments: {} })) as { structuredContent?: unknown };
      if (r.structuredContent) setModel(r.structuredContent as VerifyModel);
    } finally { setBusy(false); }
  }

  if (!model) return <div class="card"><h1>🪢 felag verify</h1><p class="status">running the conformance report…</p></div>;

  const full = mode === 'fullscreen';

  // Group criteria by contract, in preamble contract order; trailing group for
  // any criterion whose contract isn't in the preamble (defensive).
  const byContract = new Map<string, EnrichedCriterion[]>();
  for (const c of model.criteria) {
    const key = c.contractId ?? '(no contract)';
    (byContract.get(key) ?? byContract.set(key, []).get(key)!).push(c);
  }
  const orderedContracts: Contract[] = [...model.contracts];
  for (const key of byContract.keys()) {
    if (!orderedContracts.some((ct) => ct.id === key)) {
      orderedContracts.push({ id: key, description: '' });
    }
  }

  return (
    <div class="card" style={full ? { maxWidth: 'none' } : {}}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <h1>🪢 felag verify{' '}
          <span class="row" style={{ fontSize: '13px' }}>{model.implementation} ⊨ {model.conformanceVersion}</span>
        </h1>
        <VerdictPill verdict={model.report.verdict} />
      </div>

      {!full ? (
        <div>
          <p class="sub" style={{ margin: '8px 0 4px', fontSize: '15px' }}>
            <b style={{ color: model.passingCount === model.totalActive ? '#4ade80' : '#e2e8f0' }}>
              {model.passingCount}/{model.totalActive}
            </b> gating criteria passing
          </p>
          <p class="sub" style={{ margin: '0 0 6px' }}>
            <CountsStrip counts={model.counts} />
          </p>
          <div style={{ marginTop: '12px' }}>
            <button onClick={() => setDisplay('fullscreen')}>expand to report →</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      ) : (
        <div>
          <p class="sub" style={{ margin: '8px 0 10px' }}>
            <b style={{ color: model.passingCount === model.totalActive ? '#4ade80' : '#e2e8f0' }}>
              {model.passingCount}/{model.totalActive}
            </b> gating criteria passing for {model.implementation}.{' '}
            Criteria grouped by contract — failing/disputed lead; click a card for its scenario, fixtures, evidence + governance history.{' '}
            <CountsStrip counts={model.counts} />
          </p>
          {orderedContracts.map((ct) => {
            const crits = byContract.get(ct.id);
            if (!crits || !crits.length) return null;
            return (
              <ContractSection key={ct.id} ct={ct} crits={crits} model={model}
                openId={openId} setOpenId={setOpenId} />
            );
          })}
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
