# felag/author class contract — design draft v0

*2026-06-12. Closes F7 of [compilation-findings-v0](compilation-findings-v0.md):
`felag/author` is a conformance class with verbs (`author`, `excavate`,
`render`, `prime`), a label ("partially judgment-verified"), and no contract.
This draft specifies the interview, promotion, and render protocols to the
point where the class is verifiable, and states exactly which surfaces gate
mechanically versus remain judgment. Authority note: this prose is a draft
membrane per design v1.2 — when compiled, the spec records are normative and
this document is history.*

---

## 1. The central claim: most of the author class is mechanical

Design v1 labels `felag/author` "partially judgment-verified" and leaves it
at that. Tracing each verb against the fixture rule shows the label is
pessimistic. An interview is a dialog and its conduct is judgment — but
every verb's *output* is a value, and contracts over values are fixturable:

| Surface | Nature | Class |
|---|---|---|
| Promotion state machine (proposed → active/rejected/known-bug, acks, lapse, tiebreak) | pure function of (spec, transition request, clock) | **behavioral** |
| Excavate output constraints (provenance, proposed-only, scoping required) | predicate over emitted records | **behavioral** |
| Author output obligations (lint-valid, budget-respecting) | predicate over emitted records | **behavioral** |
| Render audience projection (what is included for whom) | pure function of (spec, audience) | **behavioral** |
| Prime protocol emission (the protocol items are present, verbatim) | predicate over emitted document | **behavioral** |
| Interview conduct (front-loaded questions, dialog quality) | process, not value | judgment |
| Stakeholder-render language quality ("observable language") | prose quality | judgment |
| `--from-annotations` round-trip | needs an annotation format that does not exist | **excluded** (deferred) |

The pattern is the one felag already uses for `verify`: felag never runs the
interview, just as verify never runs the implementation. The contract binds
the *artifacts* the verbs produce, and artifacts are fixturable. What the
label should say after compilation: author-class conformance is mechanical
over outputs and protocols; only conduct is judgment-verified.

## 2. The promotion protocol (the load-bearing piece)

Design v1 states the governance rules in prose (roster acknowledgment,
30-day lapse, solo-roster degeneracy, repo-owner tiebreak) and the
compilation's F6 found them unenforceable — "the design's core identity
commitments are protected by its weakest enforcement tier." The promotion
protocol fixes the half of F6 that is fixable: ratification becomes a pure,
fixturable state-transition function.

### Wire format `felag/promotion-input@0`

One JSON object:

```
{
  "asOf":        ISO timestamp — evaluation clock (same role as in verify-input),
  "spec":        concatenated parsed records (the roster lives in the preamble),
  "transition": {
    "criterionId":   id of a state: proposed criterion,
    "to":            "active" | "rejected" | "known-bug",
    "requestedAt":   ISO timestamp — starts the lapse clock,
    "requestedBy":   roster reference,
    "implementation": required iff to = known-bug — whose ledger gets the waiver,
    "justification":  required iff to = known-bug,
    "acknowledgments": [ { "implementer": roster reference,
                           "decision": "ack" | "nak",
                           "at": ISO timestamp } ]
  },
  "timeoutDays": integer, default 30 — the roster's declared timeout
}
```

### Result format `felag/promotion-result@0`

```
{
  "accepted": boolean,
  "errors":   [code],            // sorted ascending
  "resultingState": "active" | "rejected" | null,   // when accepted
  "lapsed":   [roster name],     // acks that lapsed past the timeout — loud
  "waiver":   Waiver | null      // emitted iff to = known-bug and accepted
}
```

### Transition rules (P1–P7)

- **P1** Only a `state: proposed` criterion may be transitioned
  (`E_NOT_PROPOSED` otherwise; promotion is not a cheaper deprecation or
  un-dispute — those have their own rules in it-gating).
- **P2 — to: active (ratification).** Accepted iff every roster implementer
  has either an `ack` or has lapsed: no recorded decision and
  `asOf > requestedAt + timeoutDays`. Lapsed names are listed in the result
  — liveness is loud, never silent.
- **P3 — nak blocks; deadlock tiebreaks to the repo owner.** Any `nak`
  blocks ratification (`E_VETOED`) *unless* an `ack` exists from a roster
  implementer whose roles include `repo-owner`, in which case the
  repo-owner's decision resolves the deadlock and the result is accepted
  with the nak recorded. A repo-owner `nak` is final (`E_VETOED`).
- **P4 — solo roster degenerates explicitly.** A roster of one is
  repo-owner authority: that implementer's single `ack` ratifies. (This is
  the current felag-core situation; the degeneracy is contract, not
  accident.)
- **P5 — to: rejected.** Deletes the criterion from the interchange
  (history lives in git); same acknowledgment rules as P2–P4.
- **P6 — to: known-bug.** The criterion ratifies to `active` AND the result
  carries a `kind: known-bug` waiver for `transition.implementation` —
  excavate found real divergent behavior; the spec records the correct
  behavior, the divergence is tracked in the implementation's ledger, and
  the waiver expires per the ledger's normal rules. Missing
  `implementation` or `justification` → `E_MISSING_FIELD`.
- **P7** Acknowledgments from names not on the roster → `E_NOT_ROSTER`
  (governance is the roster, no drive-by ratification).

Error codes: `E_NOT_PROPOSED`, `E_VETOED`, `E_PENDING` (acks neither
complete nor lapsed), `E_NOT_ROSTER`, `E_MISSING_FIELD`, `E_UNKNOWN_CRITERION`.

### The second roster-semantics carve-out

Design v1.2 made `dispute.by` the sole exception to
"attribution-strings-have-no-semantics": it is a roster reference that
selects behavior. The promotion protocol requires a second, identical
carve-out: **the roster role `repo-owner` carries semantics in P3/P4**
(tiebreak and degeneracy). F9 chose free-form roles; this draft narrows
that: roles remain free-form strings *except* `repo-owner`, which is a
governance keyword the promotion function reads. The compiled spec must
state both carve-outs in one place (it-gating or a new it-governance) so
the no-semantics rule reads as having exactly two enumerated exceptions.

## 3. The interview protocol (author)

The interview itself is conduct: greenfield, delta, and (deferred)
`--from-annotations` flows; the front-loaded questions ("contract or
choice? could a stranger get it wrong? which fixture proves it?"); the
preference for fixtures over checklists. These stay **judgment** — felag
never runs the interview and cannot fixture a dialog.

What gates is the interview's *output*. Wire format
`felag/author-output@0`: `{ "spec": [records], "budgets": { "criteriaPerItem": int } }`
→ result `{ "valid": boolean, "errors": [{code, ref}] }` (lint's result
shape). Rules:

- **A1** The emitted record set passes lint (all lint codes apply; an
  author implementation that emits unlintable interchange does not conform).
- **A2 — scenario budgets.** No item may carry more criteria than
  `budgets.criteriaPerItem` (default 7). Violation: `E_BUDGET_CRITERIA`
  naming the item. Budgets are per-run inputs with spec-declared defaults —
  the cap is the protocol's defense against Cucumber-style sprawl, so the
  cap itself must be mechanical.
- **A3 — provenance.** Every emitted criterion carries
  `source: forethought` (greenfield/delta interviews produce forethought;
  `discovered` is excavate's word and an author implementation that emits
  it is lying about provenance).

The no-LLM path stays normative and is already covered: hand-written
interchange validated by lint IS an author-output that passes A1–A3.

## 4. The excavate output contract

Excavate reads a repo (outside felag's verifiable boundary — same stance as
verify: felag checks artifacts, not the archaeology). Wire format
`felag/excavate-output@0`:
`{ "scope": { "contracts": [id], "surfaces": [string] } | null, "spec": [records] }`
→ lint-shaped result. Rules:

- **X1** `scope` is required; null/absent → `E_NO_SCOPE` (the bounded-scoping
  input from design v1 — unbounded excavation is how you mirror a whole
  repo into a junk-drawer spec).
- **X2** Every emitted criterion is `source: discovered` and
  `state: proposed`, carrying `discoveredAt`, `discoveredBy`,
  `triggeringEvent`. Violations: `E_BAD_PROVENANCE` naming the criterion.
  Excavate output **never gates anyone** — only the promotion protocol can
  activate it.
- **X3** The emitted record set passes lint within the declared scope:
  criteria reference only contracts named in `scope.contracts`
  (`E_OUT_OF_SCOPE` otherwise).

## 5. The render protocol

The exclusion list already refuses render aesthetics ("observable but
undeclared, therefore non-core"). What is contractual is **audience
projection** — *what* each audience sees, not how it is typeset. Wire
format `felag/render-inventory@0`: `{ "spec": [records], "audience":
"stakeholder" | "developer" | "verifier" }` → `{ "included": [recordId],
"excludedFields": [string] }`. A conforming render implementation must
produce a document whose content inventory matches:

- **R1 — stakeholder**: every item and every non-deprecated criterion
  (ids listed in `included`), human text only — `excludedFields` must cover
  fixtures, schema internals, and contract plumbing (`fixtures`,
  `contractId`, `judgment`). Disputed criteria appear with their dispute —
  loud everywhere applies to renders too.
- **R2 — developer**: stakeholder content plus contracts, fixtures, and
  Profile/Binding references; nothing excluded but render-internal noise.
- **R3 — verifier**: the identity projection — raw records, nothing
  excluded. (`render --audience verifier` and the interchange file say the
  same thing; this pins it.)
- **R4** Renders are one-way artifacts: a render is never input to any
  felag verb except (future) `author --from-annotations`. No verb in this
  contract accepts markdown.

The *language quality* of the stakeholder render ("observable language",
no implementation jargon) stays **judgment** — fixturing prose style would
pin aesthetics, which the exclusions forbid.

## 6. Prime

`prime` emits the protocols, vendor-neutral. Mechanical half: the emitted
document must contain the body text of every item under the `c-author`
contract, verbatim (wire format `felag/prime-output@0`:
`{ "spec": [records], "output": string }` → boolean-with-errors; check is
substring presence of each protocol item's `body`). Judgment half:
vendor-neutrality of any added framing — already covered by the existing
`ac-class-vendor-neutral` judgment criterion; prime adds no new judgment
surface.

## 7. Landing strategy: proposed-state criteria, MINOR now, MAJOR at ratification

Where this contract lives and how it ships:

- **c-author lands in felag-core**, not a sibling spec. The classes are the
  compiled spec's contracts (design v1, Conformance model); felag-tasks is
  a sibling because work state is *excluded from core's domain* — the
  author class is core's own third leg. The it-classes mapping and the
  preamble exclusion for F7 both update in the same change.
- **Every new criterion lands `state: proposed`.** Proposed never gates
  (it-gating), so the addition cannot change any implementation's verdict.
- **Versioning clarification folded in** (closes the cold review's L1 gap
  from PR #2 for this case): *adding criteria in `state: proposed` is
  MINOR* — they are inert until ratified; *ratifying a proposed MUST to
  `active` is MAJOR* — it is the moment gating obligations change, and it
  requires roster acknowledgment per the promotion protocol. This sentence
  belongs in it-versioning, stated as the rule, not an example.
- **The ratification of c-author is the first real execution of the
  promotion protocol it specifies.** Solo roster → P4 repo-owner
  degeneracy → Jonathan's ack ratifies. The contract enters through its own
  front door, which is also its first end-to-end test.
- Fixtures land WITH the proposed criteria (lint's E_MISSING_FIXTURES is
  state-independent, deliberately: a proposal without its interop proof is
  not reviewable).

## 8. What this draft refuses

- **`--from-annotations`** — needs an annotation format; specifying it here
  would be a second spec's worth of surface. Stays in the exclusion list
  with one sentence naming the dependency.
- **Interview conduct fixtures** — felag does not run interviews; conduct
  is judgment, permanently, by the same reasoning that verify is a ledger.
- **Render aesthetics** — already excluded; R1–R3 pin selection, never
  typesetting.
- **Judgment-criterion graduation** — the c-author judgment criteria
  (conduct, stakeholder language) ship advisory with no graduation bar,
  same as 0.2.0's existing judgment criteria. Writing the graduation bar
  is its own future contract.

## 9. Compilation checklist (the follow-up task)

New preamble contract `c-author`; items `it-author-interview`,
`it-author-excavate`, `it-author-render`, `it-author-promotion` (P/A/X/R
rule blocks as bodies); ~10 behavioral proposed criteria with fixtures
across the five wire formats; 2–3 judgment criteria (conduct, stakeholder
language); schema.json `$defs` for the five formats; it-versioning and
it-classes and exclusions updates; both roster-semantics carve-outs stated
together. felag-ts implements the validators (they are small pure
functions) in a follow-up; until then felag-ts's declared classes
(interchange, verifier) keep its verdict unaffected.
