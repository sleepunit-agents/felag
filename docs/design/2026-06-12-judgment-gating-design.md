# Judgment-criterion gating — felag-core 3.0.0 design

*Ceremony 3 (art-69e), 2026-06-12. Author: Art (felag/author conduct).
Status: design for cold review, then PR — Jonathan merges; this changes
what conformance can mean.*

## What this removes

felag-core 2.0.0 carries a standing exclusion:

> Judgment-criterion gating: no graduation bar (reproducibility tolerance,
> calibration-corpus judge substitution) exists at 1.0.0, so no spec may
> define done through a judgment criterion.

Today the 8 judgment criteria are real obligations that never gate: verify
lists them only in the advisory block (D4), and the verdict derives from
behavioral MUSTs alone. A judgment criterion is conduct — "the render
language is clear" — and no fixture can pin a judgment the way arithmetic
pins a round-trip.

This design builds the graduation bar the exclusion names, and removes it.

## The stance, applied

felag's core stance is *verify is a ledger, not a runner*. Applied to
judgment: **felag never runs the judge.** The LLM-as-judge call lives
outside the boundary, exactly like a conformance runner. What felag gains
is a **judgment record** (the judge's verdict as recorded evidence, the
analog of VerificationRecord) and a **graduation function** (a total,
deterministic, fixturable derivation: given a criterion, its calibration
corpus, the recorded judgment evidence, and a tolerance — is the criterion
gateable-satisfied?). All the non-determinism — the model call — is pushed
into record production, outside the boundary. That is how a judgment
criterion becomes as mechanically gateable as a scenario, without felag
ever judging.

Fixturability falls out: the graduation function's fixtures carry
*synthetic judge-verdict records* as inputs. Proving the function needs no
live LLM, the same way proving promote needs no live committee.

## Approaches considered

**A (chosen): integer k-of-n agreement over a latest-n window; calibration
as derived admissibility against a fixture-borne anchor corpus; one new
record type; extension of c-verification; graduated criteria fold into the
existing verdict tokens.**

**B: chance-corrected agreement coefficient (Fleiss' κ / Krippendorff's α);
asserted calibration summaries carried on records; a new c-judgment
contract; a new verdict token for judgment-pending.** Rejected, each part:
κ/α are floating-point statistics — fixture byte-equality across
reimplementations dies on float determinism, and κ is *undefined at
perfect agreement* (zero variance), which is exactly the case the protocol
wants to reward. Chance-correction's job — telling a real judge from a
coin-flipper — is done better by the calibration corpus (see the lazy-judge
anchor below). Asserted calibration ("I passed the corpus, trust me") is
bare assertion, the thing felag exists to refuse: conformance is derived
from recorded evidence, never asserted. A separate c-judgment contract
splits verdict derivation across two contracts — D3 would cite obligations
it doesn't own. A fourth verdict token breaks every existing report
consumer; waivers already express sanctioned incompleteness loudly.

**C: judge admissibility by roster-style declaration — the spec lists the
admissible judge models.** Rejected: a spec that names models hard-depends
on them, violating ac-class-vendor-neutral applied to judging itself, and
dies with every model deprecation. Substitution-by-calibration is the
design's whole point: *any* judge that reproduces the known verdicts is
admissible, today's or next year's.

## The design

### 1. The judgment record (new, it-judgment)

```
JudgmentRecord {
  criterionId, criterionHash,            # REQUIRED binding to the line as judged
  kind: "calibration" | "target",
  fixtureId, fixtureHash,                # calibration only, both REQUIRED
  implementation, conformanceVersion,    # target only, both REQUIRED
  judge: { model: string },              # structured identity, equality-only
  verdict: pass | fail | unverifiable,
  evidence, runner, at, attribution      # the VerificationRecord tail, all required
}
```

Two kinds, schema-discriminated. A **calibration** record says: judge J,
shown anchor fixture F, returned verdict V. It is implementation-free —
calibration is a property of the judge, not of anyone's conduct. A
**target** record says: judge J, shown implementation I's actual conduct
under conformance version X, returned V. Keeping the kinds in one record
type keeps ingestion, staleness, and instant-ordering mechanics single.

Bindings are the staleness story, inherited whole from 2.0.0:

- `criterionHash` (CS9 of the criterion line as judged) is **required on
  both kinds** — for a behavioral record the fixture is the contract and
  fixtureHash binds it; for a judgment the *criterion text (rubric +
  tolerance) is the contract*, so the criterion binding is the only
  binding that matters. Amend the rubric and every old verdict goes stale,
  loudly — the promotion ack's criterionHash mechanic, reused exactly.
- `fixtureHash` is **required on calibration records** (stricter than
  VerificationRecord, where it is optional): a calibration record's entire
  meaning is "this judge reproduces the known verdict on exactly this
  anchor"; an unbound calibration is meaningless. Edit an anchor and every
  judge recalibrates — fail closed.

`judge` is *structured matching plumbing, not attribution*. The precedent
is it-governance's two-kinds-of-names doctrine: attribution strings stay
opaque (ac-ver-attribution-opaque untouched — judgment records still carry
a free-form `attribution`), while roster names carry semantics exactly
where the contract reads them. `judge` is the second kind: the graduation
function groups records by judge identity using **canonical-serialization
equality only** — never parsing, never ranking, no behavior on the value.
One opaque `model` string; publishers encode version/config in it; felag
compares bytes. (`judgeConfig` from the 2.0.0 schema placeholder is
dropped: a pinned judge configuration is approach C wearing a field — the
calibration corpus replaces it.)

### 2. Calibration corpus = the judgment criterion's fixtures

A graduatable judgment criterion declares intent by carrying a `judgment`
object:

```
judgment: { rubric: string, tolerance?: { runs: int, agreement: int } }
```

and its **`fixtures` list IS its calibration corpus** — anchor fixtures
with `format: "felag/judgment-anchor@0"`, `input` the artifact to judge
(schema-opaque, whatever the rubric needs), `expected` exactly
`{"verdict":"pass"}` or `{"verdict":"fail"}`.

This is the symmetry that makes the design felag-shaped: *fixtures carry
the contract* — for a behavioral criterion they are the conformance proof,
for a judgment criterion they are the calibration anchors. No new record
type, CS8/CS9 and E_UNKNOWN_FIXTURE apply unchanged, and E_MISSING_FIXTURES
extends naturally: a judgment criterion with a `judgment` object and no
fixtures is unlintable (a graduation bar with no anchors is bare
assertion's return ticket).

**Judge admissibility** is derived, never asserted: judge J is admissible
for criterion C iff for *every* anchor in C's corpus, J's latest non-stale
calibration record (instant order, D1's tie rule) has verdict equal to the
anchor's expected verdict. The bar is pinned at all-anchors-correct — the
corpus is author-curated to be unambiguous, and a judge wrong on an
unambiguous anchor is not admissible; a softer pass-rate knob can be added
MINOR later if real corpora need it. A corpus must contain **at least one
expected-pass and at least one expected-fail anchor**, and every anchor's
`expected` must parse exactly — otherwise the criterion is
`corpus-inadequate` and *nobody* graduates. The fail-anchor requirement is
load-bearing: it is what kills the lazy always-pass judge, and it is why
the agreement statistic needs no chance correction. (This adequacy check
lives in the graduation function, not lint: lint never reads payloads —
payload opacity is an interchange invariant — while interpreting payloads
per `format` is exactly what payload-consuming functions are for.)

### 3. Reproducibility tolerance and the window

`tolerance` is contract, per criterion, with the default **{runs: 3,
agreement: 3}** pinned in the graduation wire format (the criteriaPerItem
pattern — pinned in the format, not in any spec record). Unanimity-of-3 as
default is deliberate: disagreement at n=3 means the rubric is ambiguous,
and an ambiguous rubric should not gate; authors relax it deliberately.
Lint enforces **2·agreement > runs** (E_BAD_TOLERANCE) so "reproducibly
pass" and "reproducibly fail" are mutually exclusive — no ties by
construction.

The **window**: qualifying target records are those matching
(criterionId, implementation, conformanceVersion), criterionHash current,
parseable `at`, from an admissible judge. Order by instant, equal instants
tie to greatest array index (D1's rule verbatim); take the latest
`runs`-many. Fewer than `runs` qualifying records → `insufficient-evidence`.
`unverifiable` verdicts occupy window slots and count toward neither side —
an abstention is evidence of non-reproducibility, fail closed (the
malformed-waiver stance).

The window full, count passes p and fails f:

- p ≥ agreement → **satisfied** (graduated)
- f ≥ agreement → **reproducible-fail** (judges agree the conduct violates)
- else → **unreproducible** (the judges split — a rubric problem, not a
  conduct problem; the basis code says which remedy)

**Independence is attested, not verified — named openly.** felag cannot
verify that n runs were independent (temperature, seed, even distinct
invocations) any more than it can verify a runner actually ran a fixture:
records are self-reported, "their check is reproducibility against the
public fixture corpus, not identity." A `distinctJudges` floor was
considered and deferred (adding it to tolerance later is MINOR; it tightens
only criteria that opt in). The quality bar against a degenerate judge is
calibration, which a deterministic always-pass judge cannot pass.

### 4. The graduation function (it-graduation)

Total, deterministic, fixturable — the same shape as promote and verify.

```
felag/graduation-input@0:  { criterionId, implementation, records, spec }
felag/graduation-result@0: { graduated, errors, basis, judges, window }
```

Guards, mirroring promote (single code, full result, stop):
G1 input fails the wire format → E_SCHEMA (timestamps must parse, per the
instants rule); G2 spec fails lint → E_SPEC_INVALID; G3 criterionId names
no criterion → E_UNKNOWN_CRITERION; G4 the criterion carries no `judgment`
object → E_NOT_GRADUATABLE.

Past the guards, `basis` is one of (precedence order, first that holds):
`corpus-inadequate` → `no-admissible-judge` → `insufficient-evidence` →
the window trichotomy (`satisfied` | `reproducible-fail` |
`unreproducible`). `graduated` iff basis is `satisfied`.

Provenance is **derived and loud**, not carried: `judges` lists every
judge identity appearing in the input's records for this criterion with
its computed admissibility (sorted by canonical serialization); `window`
lists the selected target records ({at, judge, verdict}, selection order).
The carried provenance on each record is minimal and binding-shaped
(judge identity, criterionHash, fixtureHash); the reproducibility stats
and calibration evidence are *computed from the ledger* every time —
derived, never asserted, the same reason promote recomputes effective
decisions instead of trusting a tally field.

Graduation is **state-independent**: it evaluates proposed criteria too
(you want to test graduation *before* ratifying one). Whether the result
gates anyone is it-gating's business.

### 5. Gating and the verdict (it-gating, it-verification amendments)

The gating definition extends: a criterion gates iff force MUST, contractId
declared, state active/disputed (disputed: everyone but the disputer), and
**class behavioral OR class judgment with a `judgment` object**. A judgment
criterion *without* a `judgment` object is advisory by construction,
exactly as before — all 8 existing judgment criteria stay advisory; this
ceremony builds the door and shoves nobody through it. (Adding a
`judgment` object to an active criterion changes implementers' obligations:
that is ac-vers-major's existing "graduates a judgment criterion to
gating" clause — MAJOR, and a deliberate act.)

Verify (D1–D6) changes minimally: a gating judgment criterion is
*satisfied* iff the graduation function returns graduated for it, over the
judgment records now carried in the verify input (`judgmentRecords`,
optional, absent means empty). Unsatisfied → D2 waivers apply unchanged →
else drifts. **No new verdict token**: insufficient judge evidence on a
gating judgment criterion is a drift, exactly as a never-run fixture is —
gating that can be dodged by not submitting evidence is not gating. An
implementer who cannot afford judge runs waives, loudly. D4's advisory
listing narrows to *non-graduatable* judgment criteria; the report shape
(D5) is unchanged — failing/waived may now name judgment criteria, and the
why lives in the graduation result, the same place a behavioral why lives
in the records.

### 6. What changes where

- **Preamble**: the judgment-gating exclusion is removed, replaced by a
  boundary exclusion: felag never executes a judge; judgment records
  arrive like VerificationRecords; run independence is attested, not
  verified. c-verification's description gains graduation.
  conformanceVersion → 3.0.0 (MAJOR: gating power added, active criterion
  text amended, schema `judgment` redefined).
- **Schema**: judgmentRecord, judgmentTolerance, graduationInput,
  graduationResult defs; criterion.judgment redefined {rubric, tolerance?};
  judgment object forbidden on class behavioral (schema conditional);
  verifyInput gains optional judgmentRecords; lint/author/excavate error
  enums gain E_BAD_TOLERANCE.
- **it-lint**: E_BAD_TOLERANCE (2·agreement ≤ runs); E_MISSING_FIXTURES
  extended to judgment-with-intent. New criteria ac-lint-tolerance,
  ac-lint-judgment-fixtures (it-lint lands at exactly 7 criteria — at
  budget).
- **it-gating**: body rewritten for the extended gating definition; new
  criterion ac-gate-graduated; ac-gate-filter's gherkin amended to scope
  to non-graduatable judgment criteria (active-text amendment, MAJOR).
- **New items**: it-judgment (record + ingestion: ac-jud-ingest),
  it-graduation (ac-grad-guards, ac-grad-admissibility, ac-grad-window,
  ac-grad-basis).
- **it-verification**: D4 advisory wording amended; verify-input
  judgmentRecords noted.
- **New criteria land proposed**, ratified via felag promote with
  governance triplets (the live protocol, runs 6–13).
- **felag-ts**: src/graduation.ts (graduate, ingestJudgment), verify/lint
  extensions, `felag graduate` CLI verb; conformance corpus green;
  CONFORMS at 3.0.0; ledger regenerated.

## Named weaknesses, honestly

1. **No distinct-judge floor.** One calibrated deterministic judge run n
   times yields trivial unanimity; reproducibility then measures only
   prompt-stability, not inter-judge robustness. Mitigated by calibration
   (the judge is at least demonstrably competent on anchors) and
   deferred as a MINOR-addable `distinctJudges` knob. The alternative —
   requiring distinct judges now — would demand multiple calibrated
   models on day one, a real adoption tax with zero live corpora.
2. **All-anchors-correct calibration bar.** A 20-anchor corpus with one
   genuinely debatable anchor bricks every judge. The discipline this
   buys (corpora stay small and unambiguous) seems right at zero live
   corpora, but the first real corpus may want a pass-rate knob; that
   addition is MINOR.
3. **Anchor quality is unverifiable.** A corpus of trivially-separable
   anchors (pass: perfect render, fail: empty string) admits weak judges.
   felag cannot fixture "the anchors are discriminating" — that is the
   spec author's judgment conduct, the same place rubric quality lives.
   ac-author-conduct's jurisdiction, named in the item body.
4. **Optional judgmentRecords on verify-input@0** rather than a format
   version bump: shape-compatible (absent = []), but a 2.0.0 verifier fed
   a 3.0.0 input silently ignores the field instead of refusing. Accepted:
   the conformanceVersion mismatch already makes such records non-matching
   at D1/graduation, and the alternative (verify-input@1) forks every
   committed verify fixture for one optional field.
5. **`unverifiable` occupying window slots** makes a single judge
   infrastructure failure block graduation until another run lands.
   Fail-closed is the house stance; the remedy (run the judge again) is
   cheap.

## Why this is MAJOR

ac-vers-major, three clauses at once: gating semantics change (judgment
criteria can now gate), active criterion text amended (ac-gate-filter),
normative algorithm text added to item bodies (graduation, window,
admissibility). 2.0.0 → 3.0.0.
