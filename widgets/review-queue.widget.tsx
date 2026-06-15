/**
 * felag "Review queue" widget — the human-in-the-loop GOVERNANCE surface
 * (Preact + ext-apps App SDK). Sibling to board.widget.tsx; shares its palette,
 * its StatusPill / ForceBadge / History primitives, and its inline↔fullscreen
 * split.
 *
 * The queue holds every criterion that needs a human: state `proposed` (awaiting
 * ratification) or `disputed` (awaiting resolution). felag governance is NOT a
 * button-press — per the felag model a button DRAFTS a plain-English instruction
 * (`felag: ratify ac-foo as active`) and the HUMAN sending it is the governance
 * act. So the action buttons here REVEAL/draft a copyable instruction line; they
 * never call a mutating server tool. callServerTool is used ONLY to refresh.
 *
 *   - INLINE: a compact, useful SUMMARY — "N awaiting review" (or "queue clear"),
 *     the first one or two cards (item title + state pill), expand + refresh.
 *   - FULLSCREEN: if pending — each criterion a governance card (state pill +
 *     force + id + parent ITEM title + readable Gherkin); click drills into the
 *     item body, fixtures, and full governance history; the ratify / make
 *     descriptive / dispute buttons draft the instruction line to send. If the
 *     queue is clear — the RECENT GOVERNANCE ACTIVITY LOG (newest acts across all
 *     criteria), so this widget always doubles as the governance ledger.
 *
 * Data comes from the felag_review_queue tool result (structuredContent),
 * enriched server-side with items / fixtures / history / recent.
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
interface HistoryEntry {
  at: string; to: string; requestedBy: string; accepted: boolean; outcome: string;
  acks: { implementer: string; decision: string }[];
}
interface RecentAct extends HistoryEntry {
  critId: string;
  itemId?: string;
  itemTitle?: string;
}
interface QueueModel {
  name: string;
  version: string;
  pending: CritView[];
  items?: Record<string, { title: string; body: string }>;
  fixtures?: Record<string, { description: string; format: string }>;
  history?: Record<string, HistoryEntry[]>;
  recent?: RecentAct[];
}

// Pill color per derived status — same palette as board.widget.tsx.
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

const app = new App({ name: 'felag-review-queue', version: '1.0.0' });

function fmtDate(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
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

/** The governance lifecycle of one criterion, oldest → newest. (Verbatim from
 * board.widget.tsx — same shape, same palette.) */
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

/** A drafted, copyable governance instruction. felag governance is NOT mutated
 * by a button — the click reveals the plain-English line; the HUMAN sending it
 * IS the governance act. We show the line (copy / send), never call a mutating
 * tool. sendPrompt (a host global) puts the line into the conversation as if the
 * human typed it — still the human's act, drafted here. */
function DraftLine({ instruction, onClear }: { instruction: string; onClear: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    try {
      navigator.clipboard?.writeText(instruction);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be unavailable */ }
  }
  function send() {
    const fn = (globalThis as { sendPrompt?: (t: string) => void }).sendPrompt;
    if (typeof fn === 'function') fn(instruction);
  }
  return (
    <div style={{ background: '#0b1220', border: '1px dashed #334155', borderRadius: '8px', padding: '8px 10px', margin: '8px 0 0' }}>
      <div class="row" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '5px' }}>
        → send this to govern (you are the act):
      </div>
      <code style={{ display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#7dd3fc',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '7px' }}>{instruction}</code>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button onClick={send}>send ↗</button>
        <button onClick={copy}>{copied ? 'copied ✓' : 'copy'}</button>
        <button onClick={onClear}>cancel</button>
      </div>
    </div>
  );
}

/** The drill-down for one pending criterion: the human item body, the readable
 * scenario, its fixtures, and its full governance history. */
function CritDetail({ c, model }: { c: CritView; model: QueueModel }) {
  const item = model.items?.[c.itemId];
  const fxMap = model.fixtures ?? {};
  const history = model.history?.[c.id] ?? [];
  return (
    <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px', margin: '2px 0 10px' }}>
      {item ? (
        <p class="desc" style={{ margin: '0 0 4px' }}>{item.body}</p>
      ) : null}

      <div class="detail-sec">
        <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '4px' }}>
          Scenario
        </div>
        <pre style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          margin: 0, color: '#cbd5e1' }}>{c.text || '(no scenario)'}</pre>
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

/** One governance card: the human title + state + force + id + readable
 * scenario, click-to-drill, and the ratify / make-descriptive / dispute actions
 * — each of which DRAFTS the plain-English instruction line (never mutates). */
function GovCard({ c, model, open, onToggle }:
  { c: CritView; model: QueueModel; open: boolean; onToggle: () => void }) {
  const item = model.items?.[c.itemId];
  const histCount = model.history?.[c.id]?.length ?? 0;
  const scenario = c.text.replace(/\s+/g, ' ').trim();
  const preview = scenario.length > 160 ? scenario.slice(0, 159) + '…' : scenario;
  const [draft, setDraft] = useState<string | null>(null);

  // The three governance moves, as drafted plain-English instructions. A dispute
  // needs a reason — drafted as a fill-in the human completes before sending.
  const actions: { label: string; instruction: string }[] = c.status === 'disputed'
    ? [
        { label: 'ratify as active', instruction: `felag: ratify ${c.id} as active` },
        { label: 'make descriptive', instruction: `felag: make ${c.id} descriptive` },
        { label: 'deprecate', instruction: `felag: deprecate ${c.id}` },
      ]
    : [
        { label: 'ratify as active', instruction: `felag: ratify ${c.id} as active` },
        { label: 'make descriptive', instruction: `felag: make ${c.id} descriptive` },
        { label: 'dispute', instruction: `felag: dispute ${c.id} because <reason>` },
      ];

  return (
    <div style={{ borderLeft: `3px solid ${STATUS_COLOR[c.status] ?? '#64748b'}`, padding: '6px 0 6px 10px', margin: '0 0 10px' }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: '#64748b', fontSize: '11px', width: '10px' }}>{open ? '▾' : '▸'}</span>
          <StatusPill status={c.status} />
          <ForceBadge force={c.force} />
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>{item?.title ?? c.itemId}</span>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#64748b' }}>{c.id}</span>
          {c.fixtures.length ? <span class="row" style={{ fontSize: '11px', opacity: 0.6 }}>· {c.fixtures.length} fx</span> : null}
          {histCount ? <span class="row" style={{ fontSize: '11px', opacity: 0.6 }}>· {histCount} gov</span> : null}
        </div>
        {preview ? (
          <div class="desc" style={{ margin: '3px 0 0 18px' }}>{preview}</div>
        ) : null}
      </div>
      {open ? (
        <div style={{ margin: '6px 0 0 18px' }}>
          <CritDetail c={c} model={model} />
          <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '5px' }}>
            Govern this criterion
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {actions.map((a) => (
              <button key={a.label} onClick={() => setDraft(a.instruction)}>{a.label}</button>
            ))}
          </div>
          {draft ? <DraftLine instruction={draft} onClear={() => setDraft(null)} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The empty-state view: felag-core is all-active, so the queue is clear. Rather
 * than a void, show the recent governance activity — the ledger of acts across
 * all criteria, newest first. Built server-side as `recent`. */
function RecentLog({ recent }: { recent: RecentAct[] }) {
  if (!recent.length) {
    return <p class="sub" style={{ margin: '10px 0 0' }}>No governance activity recorded yet.</p>;
  }
  return (
    <div style={{ margin: '6px 0 0' }}>
      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '6px' }}>
        Recent governance activity
      </div>
      {recent.map((e, i) => {
        const ok = e.accepted;
        return (
          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', padding: '5px 0',
            borderLeft: `2px solid ${ok ? '#16a34a' : '#f87171'}`, paddingLeft: '9px', marginBottom: '3px' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8', minWidth: '74px' }}>{fmtDate(e.at)}</span>
            <span style={{ fontSize: '12px', flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{e.itemTitle ?? e.itemId ?? e.critId}</span>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: '#475569', marginLeft: '7px' }}>{e.critId}</span>
              <div style={{ margin: '2px 0 0' }}>
                <b style={{ color: ok ? '#4ade80' : '#f87171' }}>{e.outcome}</b>
                {' → '}<span style={{ color: '#e2e8f0' }}>{e.to}</span>
                <span class="row" style={{ opacity: 0.7 }}> · by {e.requestedBy}</span>
              </div>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Widget() {
  const [model, setModel] = useState<QueueModel | null>(null);
  const [mode, setMode] = useState<string>('inline');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    app.ontoolresult = (r: { structuredContent?: unknown }) => {
      if (r.structuredContent) setModel(r.structuredContent as QueueModel);
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
      const r = (await app.callServerTool({ name: 'felag_review_queue', arguments: {} })) as { structuredContent?: unknown };
      if (r.structuredContent) setModel(r.structuredContent as QueueModel);
    } finally { setBusy(false); }
  }

  if (!model) return <div class="card"><h1>🪢 felag review queue</h1><p class="status">loading the queue…</p></div>;

  const full = mode === 'fullscreen';
  const pending = model.pending ?? [];
  const recent = model.recent ?? [];
  const n = pending.length;
  const headline = n ? `${n} awaiting review` : 'queue clear';

  return (
    <div class="card" style={full ? { maxWidth: 'none' } : {}}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <h1>🪢 felag review queue <span class="row" style={{ fontSize: '13px' }}>{model.name} {model.version}</span></h1>
        <span style={{ background: n ? STATUS_COLOR.proposed : '#16a34a', color: '#0b1220', fontWeight: 700,
          fontSize: '12px', padding: '2px 10px', borderRadius: '999px' }}>{headline}</span>
      </div>

      {!full ? (
        <div>
          {n ? (
            <div style={{ margin: '8px 0 4px' }}>
              {pending.slice(0, 2).map((c) => {
                const item = model.items?.[c.itemId];
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '3px 0' }}>
                    <StatusPill status={c.status} />
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>{item?.title ?? c.itemId}</span>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#64748b' }}>{c.id}</span>
                  </div>
                );
              })}
              {n > 2 ? <p class="sub" style={{ margin: '4px 0 0' }}>+ {n - 2} more</p> : null}
            </div>
          ) : (
            <p class="sub" style={{ margin: '8px 0 4px' }}>
              Nothing proposed or disputed — every criterion is ratified.{recent.length ? ` ${recent.length} recent acts on the ledger.` : ''}
            </p>
          )}
          <div style={{ marginTop: '12px' }}>
            <button onClick={() => setDisplay('fullscreen')}>expand →</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      ) : (
        <div>
          {n ? (
            <div>
              <p class="sub" style={{ margin: '8px 0 12px' }}>
                Each criterion waits for a human to sign it. Click a card for its item, fixtures, and history; a govern button DRAFTS the
                plain-English instruction — you send it, and your sending it is the governance act.
              </p>
              {pending.map((c) => (
                <GovCard key={c.id} c={c} model={model} open={openId === c.id}
                  onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
              ))}
            </div>
          ) : (
            <div>
              <p class="sub" style={{ margin: '8px 0 12px' }}>
                The review queue is clear — nothing proposed or disputed. Here is the governance ledger: the most recent acts across all
                criteria, newest first.
              </p>
              <RecentLog recent={recent} />
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
