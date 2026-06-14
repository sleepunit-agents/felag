# Excavate honesty → structured audit (felag-core 6.0.0)

Closes t-7 and t-8. Three honesty surfaces that today rest entirely on the human
cold-review/promotion layer get a **structural carrier**: felag checks each for
*presence* (never truth), turning an open-ended audit into a checklist and the
boundary itself from implicit prose into a named, gating property.

## The problem (recap)

`validateExcavateOutput` checks scope (X1), provenance *fields present* (X2:
`discoveredAt`/`discoveredBy`/`triggeringEvent`), and lint + in-scope (X3). It
does NOT check, and felag has no carrier for:

1. **Truth of discovered `expected`s (t-7)** — an output can be lint-clean,
   provenance-valid, and pure fiction. Nothing mechanical catches a wrong
   expected; the only guard is cold review.
2. **Projection fidelity (t-8.1)** — when an impl's real I/O is non-deterministic
   or MCP-shaped, the excavator *defines* a projection wire-format modeling it.
   felag has no notion of "this format is the excavator's model, not the impl's
   wire format"; a subtly-wrong projection hides behavior.
3. **Unfixturable completeness (t-8.2)** — behavior unexpressible in the
   projection (a side-effect like recall's `last_accessed`) silently degrades to
   prose. Same residue class as the (now-resolved) art-ubo.4.

felag's first principle — *prose decisions rot unless propagated into schema* —
is the lens: propagate these obligations into schema **as far as the boundary
allows**. Some truth is irreducibly outside felag (it reads no repo, runs no
impl); the design makes the boundary explicit and the human audit tractable,
not the truth mechanical.

## Stance (decided)

**Structured audit.** Name the boundary AND add provenance felag checks for
presence. Not a mechanical verify pass (excavate stays "checks artifacts, not
archaeology"; a verify pass wouldn't help t-8 anyway — projection fidelity is
upstream of the fixtures).

## The three carriers

### 1. Evidence binding (t-7) — required, MUST

- New field `evidence` on every **discovered** criterion: a reference to where
  the behavior and its expecteds were read (`src/recall.ts:88-94`, a commit sha,
  a transcript ref). A free-form string; felag never dereferences it.
- `validateExcavateOutput` X2 gains it: a discovered criterion missing `evidence`
  → `E_BAD_PROVENANCE` (joins the existing provenance triplet). **Presence only.**
- Effect: cold-review shifts from *"is this expected correct?"* (open-ended) to
  *"does the cited evidence at that location support it?"* (checkable). You can no
  longer be lint-clean while pointing at nothing — fiction must at least name a
  source it can be checked against.
- Per-criterion: the criterion is the unit of discovery and of ratification; one
  evidence cite per discovered claim. (Fixtures carry the mechanical expected;
  `evidence` cites the archaeological source of the claim.)
- New criterion **`ac-excavate-evidence`** (MUST, it-author-excavate).

### 2. Projection declaration (t-8.1) — affordance + render surfacing

- New optional field `projection` on a **discovered fixture**: a string declaring
  the fixture's format *models* a non-deterministic/excluded impl rather than
  being the impl's native wire format (e.g. `"models recall ranking; embeddings
  excluded — the excavator's deterministic projection"`).
- This gives felag the notion it lacked. felag checks only that a *declared*
  projection is a non-empty string; it CANNOT detect an undeclared projection
  (the impl's non-determinism is outside the boundary), and deliberately does not
  try — a lint rule keyed on a registry of "native" formats would couple felag to
  impl knowledge and throw false positives on every new format.
- The mechanical carrier is **visibility**: `renderInventory` for the **verifier**
  audience surfaces declared-projection fixtures as a distinct group, so the
  reviewer sees exactly which fixtures are models and audits their fidelity as a
  bounded list rather than re-deriving it.
- New criterion **`ac-excavate-projection`** (the softer one: states the field is
  honored, well-formed when present, and surfaced to the verifier).

### 3. Observed-only marker (t-8.2) — required, MUST

- A discovered criterion that is real but **unfixturable in the chosen
  projection** must carry an explicit `unfixturable: <reason>` rather than
  silently being a fixtureless prose criterion.
- `validateExcavateOutput`: a discovered criterion with empty `fixtures` AND no
  `unfixturable` reason → `E_BAD_PROVENANCE`. Degradation-to-prose becomes
  *named*. (Leans on the `descriptive` state t-6 added — such a criterion records
  "observed via inspection, unfixturable in projection P because <reason>.")
- New criterion **`ac-excavate-observed`** (MUST, it-author-excavate).

## Plumbing

- **schema.json**: declare `evidence`, `unfixturable` (criterion fields),
  `projection` (fixture field). Match existing `discoveredAt` treatment.
- **`src/author.ts`**: extend `validateExcavateOutput` X2 (evidence + observed-only
  checks). **`ExcavateOutputInput` / the criterion+fixture types in records.ts**:
  add the optional fields.
- **`src/author.ts` `renderInventory`**: verifier projection surfaces declared
  projections.
- **`it-author-excavate` body**: document X2's evidence + observed-only checks and
  the projection affordance; add an explicit "what excavate does and does NOT
  guarantee" boundary statement.
- **Fixtures** (`felag/excavate-output@0` and `felag/render-inventory@0`):
  fx-excavate-evidence (missing evidence → E_BAD_PROVENANCE), fx-excavate-observed
  (fixtureless + unfixturable → valid; fixtureless without → E_BAD_PROVENANCE),
  fx-excavate-projection / a render fixture surfacing a projection. Update
  fx-excavate-valid to carry the new fields.

## Versioning & governance

- felag-core **5.0.2 → 6.0.0** (MAJOR: additive MUST criteria + new contract
  fields on the excavate/render wire formats).
- The touched/added c-author criteria (`ac-excavate-evidence`, `-observed`,
  `-projection`, and any modified existing excavate criterion) are hash-pinned in
  `governance/2026-06-13-author-class-ratification.json`. Re-ratify: regenerate
  that artifact's affected entries with the new hashes (the bundled-ratification
  analog of the ac-ver-instant-order re-ratification in 5.0.1). New criteria are
  authored `proposed` then promoted to `active` through the protocol, exactly as
  the c-author class itself was at 5.0.0.

## Gate

tsc clean · full corpus (the new fixtures pass) · self-verify CONFORMS at 6.0.0
· 3 specs lint · smoke OK · governance triplets reproduce · 0 stale acks ·
author-class ratification current.

## Non-goals

- No mechanical verification of discovered truth (excavate reads no repo, runs no
  impl — the boundary stance is preserved, now explicit).
- No registry of "native" formats / no lint-warn on undeclared projections.
- No change to verify/promotion semantics; excavate output still gates no one and
  is activated only by promotion.
