/**
 * felag "Lint" widget — the merge gate, made human (Preact + ext-apps App SDK).
 *
 * Renders the felag LintResult enriched so it's never a wall of opaque codes:
 *   - INLINE: a compact summary — spec name, valid/invalid pill, "N errors ·
 *     M orphan fixtures" (or "well-formed").
 *   - FULLSCREEN: the full report. When NOT clean, every lint error is an
 *     expandable card — the code + a plain-English explanation of WHAT IT MEANS
 *     and HOW TO FIX IT, the offending record resolved to its human content, and
 *     a drill-down into the related item/criterion (+ its GOVERNANCE HISTORY,
 *     reused verbatim from the board). Orphan fixtures sit below in amber, each
 *     with its description + format + the contract it dangles from. When CLEAN,
 *     a rich passed-inspection: ✓ well-formed + the stats the gate checked.
 *
 * Data comes from the felag_lint_view tool result (structuredContent), enriched
 * server-side, and refreshes via callServerTool.
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { App } from '@modelcontextprotocol/ext-apps';

interface LintError { code: string; ref: string; }
interface LintResult { valid: boolean; errors: LintError[]; }

interface EnrichedError {
  code: string;
  ref: string;
  title: string;
  meaning: string;
  fix: string;
  recordKind: 'item' | 'criterion' | 'fixture' | 'preamble' | 'unknown';
  human: string;
  itemId?: string;
  detail?: Record<string, unknown>;
}
interface EnrichedOrphan {
  id: string;
  description: string;
  format: string;
  contractId?: string;
}
interface HistoryEntry {
  at: string; to: string; requestedBy: string; accepted: boolean; outcome: string;
  acks: { implementer: string; decision: string }[];
}
interface Stats {
  records: number; items: number; criteria: number; fixtures: number; referencedFixtures: number;
}
interface LintModel {
  spec: string;
  version: string;
  result: LintResult;
  errorsEnriched: EnrichedError[];
  orphansEnriched: EnrichedOrphan[];
  stats: Stats;
  items?: Record<string, { title: string; body: string }>;
  fixtures?: Record<string, { description: string; format: string }>;
  history?: Record<string, HistoryEntry[]>;
}

const RED = '#f87171';
const GREEN = '#16a34a';
const AMBER = '#fbbf24';

const app = new App({ name: 'felag-lint', version: '1.0.0' });

function fmtDate(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function ValidPill({ valid, hasOrphans }: { valid: boolean; hasOrphans: boolean }) {
  // green ✓ only when valid AND no orphan warnings; amber when valid-with-orphans; red when invalid.
  const clean = valid && !hasOrphans;
  const c = !valid ? RED : hasOrphans ? AMBER : GREEN;
  const label = !valid ? 'invalid' : hasOrphans ? 'valid · warnings' : 'well-formed';
  return (
    <span style={{ background: c, color: '#0b1220', fontWeight: 700, fontSize: '12px',
      padding: '2px 10px', borderRadius: '999px' }}>{clean ? '✓ ' : ''}{label}</span>
  );
}

function CodeBadge({ code, color }: { code: string; color: string }) {
  return (
    <span style={{ border: `1px solid ${color}`, color, fontWeight: 700, fontSize: '10px',
      padding: '1px 6px', borderRadius: '6px', fontFamily: 'ui-monospace, monospace' }}>{code}</span>
  );
}

/** The governance lifecycle of one criterion, oldest → newest. (Reused verbatim
 * from the board widget — same shape, same look.) */
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
            borderLeft: `2px solid ${ok ? GREEN : RED}`, paddingLeft: '8px', marginBottom: '3px' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8', minWidth: '74px' }}>{fmtDate(e.at)}</span>
            <span style={{ fontSize: '12px' }}>
              <b style={{ color: ok ? '#4ade80' : RED }}>{e.outcome}</b>
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

/** Drill-down detail for one lint error: how to fix it, the offending record's
 * full human content, the related item, and — when the error implicates a
 * criterion — that criterion's governance history. */
function ErrorDetail({ e, model }: { e: EnrichedError; model: LintModel }) {
  const item = e.itemId ? model.items?.[e.itemId] : undefined;
  const critHistory = model.history?.[e.ref] ?? [];
  const d = e.detail ?? {};
  return (
    <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px', margin: '2px 0 10px' }}>
      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
        How to fix
      </div>
      <p style={{ fontSize: '13px', color: '#e2e8f0', margin: '0 0 8px', lineHeight: 1.5 }}>{e.fix}</p>

      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
        Offending record <span style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'none', opacity: 0.8 }}>· {e.ref} ({e.recordKind})</span>
      </div>

      {e.recordKind === 'criterion' ? (
        <div>
          <div style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 4px' }}>
            {typeof d.force === 'string' ? <span>{d.force} · </span> : null}
            {typeof d.state === 'string' ? <span>{d.state} · </span> : null}
            {typeof d.class === 'string' ? <span>{d.class}</span> : null}
            {typeof d.contractId === 'string' ? <span> · contract <b style={{ color: '#7dd3fc' }}>{d.contractId}</b></span> : null}
          </div>
          {item ? (
            <div style={{ fontSize: '12px', color: '#cbd5e1', margin: '0 0 6px' }}>
              <span style={{ opacity: 0.6 }}>item: </span><b>{item.title}</b>
              <span class="row" style={{ display: 'block', marginTop: '2px', lineHeight: 1.5 }}>{item.body}</span>
            </div>
          ) : null}
          <pre style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            margin: '0 0 6px', color: '#cbd5e1' }}>{typeof d.gherkin === 'string' && d.gherkin ? d.gherkin : '(no scenario)'}</pre>
          {Array.isArray(d.fixtures) && d.fixtures.length ? (
            <div style={{ fontSize: '12px' }}>
              <span style={{ opacity: 0.6 }}>fixtures: </span>
              {(d.fixtures as string[]).map((fid, i) => (
                <span key={fid} style={{ fontFamily: 'ui-monospace, monospace', color: '#7dd3fc' }}>{i ? ', ' : ''}{fid}</span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: AMBER }}>fixtures: — (none)</div>
          )}
          <History entries={critHistory} />
        </div>
      ) : e.recordKind === 'item' ? (
        <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
          <b style={{ color: '#e2e8f0' }}>{String(d.title ?? e.human)}</b>
          {d.body ? <div style={{ marginTop: '3px' }}>{String(d.body)}</div> : null}
        </div>
      ) : e.recordKind === 'fixture' ? (
        <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
          <div>{String(d.description ?? e.human)}</div>
          {d.format ? <div style={{ marginTop: '3px', opacity: 0.8 }}>format: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{String(d.format)}</span></div> : null}
          {d.contractId ? <div style={{ opacity: 0.8 }}>contract: <span style={{ color: '#7dd3fc' }}>{String(d.contractId)}</span></div> : null}
        </div>
      ) : e.recordKind === 'preamble' ? (
        <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
          {e.human}
          {Array.isArray(d.implementers) ? (
            <div style={{ marginTop: '4px', opacity: 0.8 }}>
              roster: {(d.implementers as { name?: string }[]).map((x) => x?.name).filter(Boolean).join(', ')}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: '#cbd5e1' }}>{e.human}</div>
      )}
    </div>
  );
}

/** One lint error card. Shows the code + a plain-English title and one-line
 * meaning (not just the id), and toggles its drill-down detail on click. */
function ErrorCard({ e, model, open, onToggle }: { e: EnrichedError; model: LintModel; open: boolean; onToggle: () => void }) {
  const histCount = e.itemId ? (model.history?.[e.ref]?.length ?? 0) : 0;
  return (
    <div style={{ borderLeft: `3px solid ${RED}`, padding: '6px 0 6px 10px', margin: '0 0 8px' }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: '#64748b', fontSize: '11px', width: '10px' }}>{open ? '▾' : '▸'}</span>
          <CodeBadge code={e.code} color={RED} />
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>{e.title}</span>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#64748b' }}>{e.ref}</span>
          {histCount ? <span class="row" style={{ fontSize: '11px', opacity: 0.6 }}>· {histCount} gov</span> : null}
        </div>
        <div style={{ fontSize: '13px', color: '#cbd5e1', margin: '3px 0 0 18px', lineHeight: 1.45 }}>{e.meaning}</div>
        <div style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 18px', lineHeight: 1.4 }}>
          <span style={{ opacity: 0.6 }}>at: </span>{e.human}
        </div>
      </div>
      {open ? <div style={{ margin: '6px 0 0 18px' }}><ErrorDetail e={e} model={model} /></div> : null}
    </div>
  );
}

/** One orphan-fixture card (amber — a warning, not a gate failure). Shows the
 * fixture's description + format + which contract it dangles from. */
function OrphanCard({ o }: { o: EnrichedOrphan }) {
  return (
    <div style={{ borderLeft: `3px solid ${AMBER}`, padding: '6px 0 6px 10px', margin: '0 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <CodeBadge code="orphan" color={AMBER} />
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#7dd3fc' }}>{o.id}</span>
        {o.contractId
          ? <span class="row" style={{ fontSize: '11px', opacity: 0.7 }}>· dangles from <b style={{ color: '#7dd3fc' }}>{o.contractId}</b></span>
          : <span class="row" style={{ fontSize: '11px', opacity: 0.7 }}>· no contract (advisory)</span>}
      </div>
      {o.description ? (
        <div style={{ fontSize: '13px', color: '#cbd5e1', margin: '3px 0 0', lineHeight: 1.45 }}>{o.description}</div>
      ) : null}
      {o.format ? (
        <div style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
          format: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{o.format}</span>
        </div>
      ) : null}
    </div>
  );
}

/** The passed-inspection panel — shown when the spec is clean (0 errors, 0
 * orphans). Not an empty page: it affirms the clean bill of health + the stats
 * the gate actually checked. */
function CleanReport({ model }: { model: LintModel }) {
  const s = model.stats;
  const checks: { label: string; ok: boolean }[] = [
    { label: 'every record matches its schema', ok: true },
    { label: 'every id is unique', ok: true },
    { label: 'every contractId is declared in the preamble', ok: true },
    { label: 'every behavioral criterion carries its fixtures', ok: true },
    { label: `every criterion's fixtures resolve (${s.referencedFixtures}/${s.fixtures})`, ok: true },
    { label: `no orphan fixtures (${s.fixtures - s.referencedFixtures} unreferenced)`, ok: true },
  ];
  return (
    <div>
      <div style={{ background: '#0b1220', border: `1px solid ${GREEN}`, borderRadius: '10px', padding: '16px 18px', margin: '4px 0 14px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#4ade80' }}>✓ {model.spec} is well-formed</div>
        <p class="row" style={{ margin: '6px 0 0', fontSize: '13px' }}>
          The merge gate passed clean — no errors, no orphan fixtures. {model.version ? <span>Conformance {model.version}.</span> : null}
        </p>
      </div>

      <h2>What the gate checked</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '4px 0 12px' }}>
        {[
          { n: s.records, l: 'records' },
          { n: s.items, l: 'items' },
          { n: s.criteria, l: 'criteria' },
          { n: s.fixtures, l: 'fixtures' },
          { n: s.fixtures - s.referencedFixtures, l: 'orphans' },
        ].map((b) => (
          <div key={b.l} style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px', padding: '8px 14px', minWidth: '78px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: b.l === 'orphans' && b.n === 0 ? '#4ade80' : '#e2e8f0' }}>{b.n}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{b.l}</div>
          </div>
        ))}
      </div>

      <h2>Checks passed</h2>
      <div style={{ margin: '4px 0 0' }}>
        {checks.map((c) => (
          <div key={c.label} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '3px 0' }}>
            <span style={{ color: '#4ade80', fontWeight: 700 }}>✓</span>
            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Widget() {
  const [model, setModel] = useState<LintModel | null>(null);
  const [mode, setMode] = useState<string>('inline');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    app.ontoolresult = (r: { structuredContent?: unknown }) => {
      if (r.structuredContent) setModel(r.structuredContent as LintModel);
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
      const r = (await app.callServerTool({ name: 'felag_lint_view', arguments: {} })) as { structuredContent?: unknown };
      if (r.structuredContent) setModel(r.structuredContent as LintModel);
    } finally { setBusy(false); }
  }

  if (!model) return <div class="card"><h1>🪢 felag lint</h1><p class="status">linting…</p></div>;

  const errs = model.errorsEnriched ?? [];
  const orphans = model.orphansEnriched ?? [];
  const valid = model.result?.valid ?? errs.length === 0;
  const hasOrphans = orphans.length > 0;
  const clean = valid && !hasOrphans;
  const full = mode === 'fullscreen';

  const countLine = clean
    ? 'well-formed'
    : `${errs.length} error${errs.length === 1 ? '' : 's'} · ${orphans.length} orphan fixture${orphans.length === 1 ? '' : 's'}`;

  return (
    <div class="card" style={full ? { maxWidth: 'none' } : {}}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <h1>🪢 felag lint <span class="row" style={{ fontSize: '13px' }}>{model.spec}{model.version ? ` ${model.version}` : ''}</span></h1>
        <ValidPill valid={valid} hasOrphans={hasOrphans} />
      </div>

      {!full ? (
        <div>
          <p class="sub" style={{ margin: '8px 0 6px' }}>
            <span class="row" style={{ color: clean ? '#4ade80' : errs.length ? RED : AMBER }}>{countLine}</span>
          </p>
          <div style={{ marginTop: '12px' }}>
            <button onClick={() => setDisplay('fullscreen')}>expand to report →</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      ) : (
        <div>
          {clean ? (
            <CleanReport model={model} />
          ) : (
            <div>
              <p class="sub" style={{ margin: '8px 0 10px' }}>
                The merge gate — each error a code with a plain-English explanation + fix, the offending record resolved; click a card to drill into the related item/criterion + its governance history.{' '}
                <span class="row" style={{ color: errs.length ? RED : AMBER }}>{countLine}</span>
              </p>

              {errs.length ? (
                <div style={{ marginBottom: '18px' }}>
                  <h2 style={{ color: RED }}>Errors <span class="row" style={{ fontWeight: 400 }}>· {errs.length} · fail the gate</span></h2>
                  {errs.map((e, i) => (
                    <ErrorCard key={`${e.code}:${e.ref}:${i}`} e={e} model={model}
                      open={openId === `${e.code}:${e.ref}:${i}`}
                      onToggle={() => setOpenId(openId === `${e.code}:${e.ref}:${i}` ? null : `${e.code}:${e.ref}:${i}`)} />
                  ))}
                </div>
              ) : null}

              {orphans.length ? (
                <div style={{ marginBottom: '18px' }}>
                  <h2 style={{ color: AMBER }}>Orphan fixtures <span class="row" style={{ fontWeight: 400 }}>· {orphans.length} · warnings, not gate failures</span></h2>
                  <p class="row" style={{ fontSize: '12px', margin: '0 0 10px' }}>
                    Committed fixtures referenced by no criterion — an interop proof for nothing. Wire each to a criterion, or remove it.
                  </p>
                  {orphans.map((o) => <OrphanCard key={o.id} o={o} />)}
                </div>
              ) : null}
            </div>
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
