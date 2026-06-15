/**
 * felag "render" widget — audience projections (Preact + ext-apps App SDK).
 *
 * `render` projects a spec for one of three audiences in a visibility ramp:
 * stakeholder (least) → developer → verifier (everything + projections). The
 * inventory felag returns is sets of opaque record ids; this view makes them
 * READABLE — every included id resolves (via recordIndex) to its human content,
 * grouped by item:
 *   - INLINE: a compact summary — which audience, how many records it includes,
 *     a quick audience switcher; expand / refresh.
 *   - FULLSCREEN: an audience switcher (3 buttons, active highlighted). For the
 *     active audience: the included records as a readable list grouped by their
 *     parent ITEM (the item, then its criteria, then the fixtures), each shown
 *     by its title / Gherkin / description, click-to-drill into detail (item
 *     body / criterion Gherkin+force / fixture description+format). The
 *     excluded fields render as a labeled "hidden from this audience" chip list;
 *     for the verifier, the projections (fixtures whose format models the impl)
 *     surface as their own group. Switching audience is a CLIENT-SIDE swap — all
 *     three inventories ride in one payload, no server round-trip.
 *
 * Data comes from the felag_render_view tool result (structuredContent),
 * enriched server-side with the recordIndex / items / fixtures, and refreshes
 * via callServerTool.
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { App } from '@modelcontextprotocol/ext-apps';

type Audience = 'stakeholder' | 'developer' | 'verifier';

interface RecordMeta {
  kind: 'item' | 'criterion' | 'fixture' | 'preamble';
  title?: string;
  body?: string;
  gherkin?: string;
  force?: string;
  state?: string;
  itemId?: string;
  description?: string;
  format?: string;
  projection?: string;
}
interface AudienceInventory {
  audience: Audience;
  included: string[];
  excludedFields: string[];
  projections: string[];
}
interface RenderModel {
  spec: string;
  audiences: AudienceInventory[];
  recordIndex: Record<string, RecordMeta>;
  items: Record<string, { title: string; body: string }>;
  fixtures: Record<string, { description: string; format: string }>;
}

// The visibility ramp, in order. desc = the one-line "what this audience sees".
const AUDIENCE_META: { key: Audience; label: string; desc: string }[] = [
  { key: 'stakeholder', label: 'Stakeholder', desc: 'what a non-implementer sees — items and active criteria; no fixtures, no internal fields.' },
  { key: 'developer', label: 'Developer', desc: 'the build view — items, criteria, and fixtures; every field visible.' },
  { key: 'verifier', label: 'Verifier', desc: 'the full record — everything, including deprecated criteria, plus projections to audit.' },
];

const AUDIENCE_COLOR: Record<Audience, string> = {
  stakeholder: '#a78bfa',
  developer: '#38bdf8',
  verifier: '#4ade80',
};

const app = new App({ name: 'felag-render', version: '1.0.0' });

function ForceBadge({ force }: { force: string }) {
  if (!force) return null;
  return (
    <span style={{ border: '1px solid #334155', color: '#94a3b8', fontWeight: 600, fontSize: '10px',
      padding: '1px 6px', borderRadius: '6px', fontFamily: 'ui-monospace, monospace' }}>{force.toUpperCase()}</span>
  );
}

function StateBadge({ state }: { state: string }) {
  if (!state) return null;
  const c = state === 'deprecated' ? '#475569' : state === 'proposed' ? '#60a5fa' : state === 'disputed' ? '#f87171' : '#64748b';
  return (
    <span style={{ background: c, color: '#0b1220', fontWeight: 700, fontSize: '10px',
      padding: '1px 7px', borderRadius: '999px' }}>{state}</span>
  );
}

/** The drill-down detail for one included record — its human content by kind. */
function RecordDetail({ id, meta }: { id: string; meta: RecordMeta | undefined }) {
  if (!meta) {
    return (
      <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px', margin: '2px 0 8px' }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', color: '#7dd3fc' }}>{id}</span>
        <p class="desc" style={{ margin: '6px 0 0' }}>(no detail for this id)</p>
      </div>
    );
  }
  const Label = ({ children }: { children: string }) => (
    <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, margin: '0 0 4px' }}>{children}</div>
  );
  return (
    <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px', margin: '2px 0 8px' }}>
      {meta.kind === 'item' ? (
        <div class="detail-sec">
          <Label>Item body</Label>
          <p class="desc" style={{ margin: 0 }}>{meta.body || '(no body)'}</p>
        </div>
      ) : meta.kind === 'criterion' ? (
        <div class="detail-sec">
          <Label>Scenario</Label>
          <pre style={{ margin: 0 }}>{meta.gherkin || '(no scenario)'}</pre>
          <div class="row" style={{ fontSize: '11px', margin: '8px 0 0', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <ForceBadge force={meta.force ?? ''} />
            <StateBadge state={meta.state ?? ''} />
            {meta.itemId ? <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: '#475569' }}>item {meta.itemId}</span> : null}
          </div>
        </div>
      ) : (
        <div class="detail-sec">
          <Label>Fixture</Label>
          <p class="desc" style={{ margin: '0 0 6px' }}>{meta.description || '(no description)'}</p>
          <div class="row" style={{ fontSize: '11px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {meta.format ? <span>format: <b style={{ color: '#e2e8f0', fontFamily: 'ui-monospace, monospace' }}>{meta.format}</b></span> : null}
            {meta.projection ? (
              <span style={{ color: '#4ade80' }}>· models the impl: {meta.projection}</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** One included record, by its human label, with click-to-drill detail. */
function RecordRow({ id, meta, open, onToggle, accent }:
  { id: string; meta: RecordMeta | undefined; open: boolean; onToggle: () => void; accent: string }) {
  const label = meta?.kind === 'item'
    ? (meta.title || id)
    : meta?.kind === 'criterion'
      ? (meta.gherkin ? firstLine(meta.gherkin) : id)
      : meta?.kind === 'fixture'
        ? (meta.description || id)
        : id;
  return (
    <div style={{ borderLeft: `3px solid ${accent}`, padding: '5px 0 5px 10px', margin: '0 0 6px' }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: '#64748b', fontSize: '11px', width: '10px' }}>{open ? '▾' : '▸'}</span>
          {meta?.kind === 'criterion' ? <ForceBadge force={meta.force ?? ''} /> : null}
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#64748b' }}>{id}</span>
        </div>
        <div class="desc" style={{ margin: '3px 0 0 18px' }}>{clip(label, 150)}</div>
      </div>
      {open ? <div style={{ margin: '5px 0 0 18px' }}><RecordDetail id={id} meta={meta} /></div> : null}
    </div>
  );
}

function firstLine(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t;
}
function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** The included records for one audience, grouped by their parent ITEM: the
 * item first, then its criteria, then the fixtures (which fall outside items). */
function IncludedByItem({ inv, model, openId, setOpenId }:
  { inv: AudienceInventory; model: RenderModel; openId: string | null; setOpenId: (id: string | null) => void }) {
  const idx = model.recordIndex;
  const included = new Set(inv.included);
  const projectionSet = new Set(inv.projections);

  // Partition included ids by kind.
  const itemIds = inv.included.filter((id) => idx[id]?.kind === 'item');
  const critIds = inv.included.filter((id) => idx[id]?.kind === 'criterion');
  // Non-projection fixtures here; projections get their own distinct group.
  const fixtureIds = inv.included.filter((id) => idx[id]?.kind === 'fixture' && !projectionSet.has(id));

  // Group criteria under their parent item, preserving item order; criteria
  // whose item isn't included (shouldn't happen, but be safe) fall to "other".
  const itemOrder = [...itemIds];
  const critsByItem: Record<string, string[]> = {};
  const orphanCrits: string[] = [];
  for (const cid of critIds) {
    const parent = idx[cid]?.itemId ?? '';
    if (parent && included.has(parent)) {
      (critsByItem[parent] ??= []).push(cid);
    } else {
      orphanCrits.push(cid);
    }
  }

  const accent = AUDIENCE_COLOR[inv.audience];
  const row = (id: string) => (
    <RecordRow key={id} id={id} meta={idx[id]} accent={accent}
      open={openId === id} onToggle={() => setOpenId(openId === id ? null : id)} />
  );

  return (
    <div>
      <h2>Included <span class="row" style={{ fontWeight: 400 }}>· {inv.included.length} records</span></h2>

      {itemOrder.map((iid) => {
        const item = idx[iid];
        const kids = critsByItem[iid] ?? [];
        return (
          <div key={iid} class="section">
            {row(iid)}
            {kids.length ? (
              <div style={{ margin: '0 0 0 14px' }}>{kids.map(row)}</div>
            ) : (
              <div class="row" style={{ fontSize: '11px', margin: '0 0 6px 32px', opacity: 0.5 }}>no criteria visible to this audience</div>
            )}
          </div>
        );
      })}

      {orphanCrits.length ? (
        <div class="section">
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: '0 0 5px' }}>Other criteria</div>
          {orphanCrits.map(row)}
        </div>
      ) : null}

      {fixtureIds.length ? (
        <div class="section">
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: '0 0 5px' }}>
            Fixtures <span class="row" style={{ fontWeight: 400 }}>· {fixtureIds.length} · interop proofs</span>
          </div>
          {fixtureIds.map(row)}
        </div>
      ) : null}

      {/* Verifier-only: fixtures whose format MODELS the impl — audit their fidelity. */}
      {inv.projections.length ? (
        <div class="section" style={{ border: '1px solid #14532d', borderRadius: '8px', padding: '10px 12px', background: '#0b1a12' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#4ade80', margin: '0 0 4px' }}>
            Projections to audit <span class="row" style={{ fontWeight: 400 }}>· {inv.projections.length}</span>
          </div>
          <p class="desc" style={{ margin: '0 0 8px' }}>
            Fixtures whose format <b>models</b> the implementation — the excavator's projection, not the impl's wire format.
            felag checks they are declared; <b>you</b> audit whether the model is faithful.
          </p>
          {inv.projections.map(row)}
        </div>
      ) : null}

      <ExcludedFields fields={inv.excludedFields} who={inv.audience} />
    </div>
  );
}

/** The fields projected OUT for this audience — present in the record, withheld
 * from this view. A labeled chip list, or a note when nothing is hidden. */
function ExcludedFields({ fields, who }: { fields: string[]; who: Audience }) {
  if (!fields.length) {
    return (
      <p class="desc" style={{ margin: '8px 0 0' }}>
        Every field is visible to the {who} — nothing projected out.
      </p>
    );
  }
  return (
    <div style={{ margin: '12px 0 0' }}>
      <div class="row" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, margin: '0 0 6px' }}>
        Hidden from the {who} · {fields.length}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {fields.map((f) => (
          <span key={f} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8',
            border: '1px dashed #475569', borderRadius: '6px', padding: '2px 8px', opacity: 0.85 }}>{f}</span>
        ))}
      </div>
    </div>
  );
}

/** The audience switcher — three buttons, the active one highlighted. */
function AudienceSwitcher({ active, onPick }: { active: Audience; onPick: (a: Audience) => void }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '4px 0 10px' }}>
      {AUDIENCE_META.map((m) => {
        const on = m.key === active;
        const c = AUDIENCE_COLOR[m.key];
        return (
          <button key={m.key} onClick={() => onPick(m.key)}
            aria-pressed={on}
            style={on
              ? { borderColor: c, background: c, color: '#0b1220', fontWeight: 700 }
              : { borderColor: '#334155', background: '#1e293b' }}>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function Widget() {
  const [model, setModel] = useState<RenderModel | null>(null);
  const [mode, setMode] = useState<string>('inline');
  const [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState<Audience>('stakeholder');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    app.ontoolresult = (r: { structuredContent?: unknown }) => {
      if (r.structuredContent) setModel(r.structuredContent as RenderModel);
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
      const r = (await app.callServerTool({ name: 'felag_render_view', arguments: {} })) as { structuredContent?: unknown };
      if (r.structuredContent) setModel(r.structuredContent as RenderModel);
    } finally { setBusy(false); }
  }
  function pickAudience(a: Audience) {
    setAudience(a);
    setOpenId(null); // a fresh projection — drop any open drill-down
  }

  if (!model) return <div class="card"><h1>🪢 felag render</h1><p class="status">loading the projection…</p></div>;

  const inv = model.audiences.find((x) => x.audience === audience) ?? model.audiences[0];
  const meta = AUDIENCE_META.find((m) => m.key === inv.audience) ?? AUDIENCE_META[0];
  const full = mode === 'fullscreen';

  return (
    <div class="card" style={full ? { maxWidth: 'none' } : {}}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <h1>🪢 felag render <span class="row" style={{ fontSize: '13px' }}>{model.spec}</span></h1>
        <span style={{ background: AUDIENCE_COLOR[inv.audience], color: '#0b1220', fontWeight: 700, fontSize: '12px',
          padding: '2px 10px', borderRadius: '999px' }}>{meta.label}</span>
      </div>

      {!full ? (
        <div>
          <p class="sub" style={{ margin: '8px 0 6px' }}>
            <b style={{ color: '#e2e8f0' }}>{inv.included.length}</b> records included
            {inv.excludedFields.length ? <> · <b style={{ color: '#e2e8f0' }}>{inv.excludedFields.length}</b> fields hidden</> : null}
            {inv.projections.length ? <> · <b style={{ color: '#4ade80' }}>{inv.projections.length}</b> to audit</> : null}
          </p>
          <p class="desc" style={{ margin: '0 0 8px' }}>{meta.desc}</p>
          <AudienceSwitcher active={audience} onPick={pickAudience} />
          <div style={{ marginTop: '6px' }}>
            <button onClick={() => setDisplay('fullscreen')}>expand to projection →</button>
            <button onClick={refresh} disabled={busy}>{busy ? '…' : 'refresh'}</button>
          </div>
        </div>
      ) : (
        <div>
          <p class="sub" style={{ margin: '8px 0 8px' }}>
            What each audience sees — switch audience to change the included set and the hidden fields. Click any record to drill into its detail.
          </p>
          <AudienceSwitcher active={audience} onPick={pickAudience} />
          <p class="desc" style={{ margin: '0 0 12px' }}>{meta.desc}</p>

          <IncludedByItem inv={inv} model={model} openId={openId} setOpenId={setOpenId} />

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
