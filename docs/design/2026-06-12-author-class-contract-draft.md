# felag/author class contract — design draft v0.1

*2026-06-12. Closes F7 of [compilation-findings-v0](compilation-findings-v0.md):
`felag/author` is a conformance class with verbs (`author`, `excavate`,
`render`, `prime`), a label ("partially judgment-verified"), and no contract.
This draft specifies the interview, promotion, and render protocols to the
point where the class is verifiable, and states exactly which surfaces gate
mechanically versus remain judgment. Authority note: this prose is a draft
membrane per design v1.2 — when compiled, the spec records are normative and
this document is history.*

*v0.1 (same day): cold review round 1 (verdict REVISE-FIRST) found the
promotion function non-total (conflicting acks, unsourced waiver fields,
P6 quorum unstated, multiple repo-owners), the MINOR landing circular, and
four wire-format sketches too thin to compile. All folded in; disposition
table at the end.*

---

## 1. The central claim: the author class binds artifacts, not process

Design v1 labels `felag/author` "partially judgment-verified" and leaves it
at that. Tracing each verb against the fixture rule shows the mechanical
share is much larger than the label suggests. An interview is a dialog and
its conduct is judgment — but every verb's *output* is a value, and
contracts over values are fixturable:

| Surface | Nature | Class |
|---|---|---|
| Promotion state machine (proposed → active/rejected, acks, lapse, tiebreak) | pure function of (spec, transition request, clock) | **behavioral** |
| Excavate output constraints (provenance, proposed-only, scoping required) | predicate over emitted records | **behavioral** |
| Author output obligations (lint-valid, budget-respecting) | predicate over emitted records | **behavioral** |
| Render audience projection (what is included for whom) | pure function of (spec, audience) | **behavioral** |
| Prime protocol emission (protocol bodies present, verbatim) | predicate over emitted document | **behavioral** |
| Interview conduct (front-loaded questions, dialog quality) | process, not value | judgment |
| Stakeholder-render language quality ("observable language") | prose quality | judgment |
| `--from-annotations` round-trip | needs an annotation format that does not exist | **excluded** (deferred) |

The pattern is the one felag already uses for `verify`: felag never runs the
interview, just as verify never runs the implementation. The contract binds
the *artifacts* the verbs produce, and artifacts are fixturable.

The existing `ac-class-author-labeled` criterion ("author-class conformance
is partially judgment-verified, on its face") **stays as written**: it
remains literally true after this contract — conduct is judgment,
permanently. This draft does not edit that criterion; it shrinks the
judgment share without eliminating it. (v0 proposed a relabel; review round
1 correctly noted that edits MUST criteria for no contractual gain.)

## 2. The promotion protocol (the load-bearing piece)

Design v1 states the governance rules in prose (roster acknowledgment,
30-day lapse, solo-roster degeneracy, repo-owner tiebreak) and the
compilation's F6 found them unenforceable — "the design's core identity
commitments are protected by its weakest enforcement tier." The promotion
protocol fixes the half of F6 that is fixable: ratification becomes a
total, deterministic, fixturable state-transition function. Totality is
the design requirement: every input in the format's space has exactly one
defined output, or two independent compilers will diverge exactly where
governance matters most.

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
    "requestedBy":   roster reference (validated, see P7),
    "implementation": required iff to = known-bug — whose ledger gets the waiver,
    "justification":  required iff to = known-bug,
    "expiresAt":      required iff to = known-bug — the waiver's expiry,
    "attribution":    required iff to = known-bug — the waiver's attribution string,
    "acknowledgments": [ { "implementer": roster reference,
                           "decision": "ack" | "nak",
                           "at": ISO timestamp } ]
  },
  "timeoutDays": integer, default 30 — the roster's declared timeout
}
```

Every field of the emitted waiver (P6) now has a source in the input; the
function is pure. (v0 left `expiresAt` and `attribution` sourceless —
review C1.)

### Result format `felag/promotion-result@0`

```
{
  "accepted": boolean,
  "errors":   [code],            // ALL applicable errors, sorted ascending —
                                 // same all-applicable convention as lint/ingest
  "outcome":  "ratified" | "rejected" | null,
  "lapsed":   [roster name],     // acks that lapsed past the timeout — loud
  "waiver":   Waiver | null      // emitted iff to = known-bug and accepted
}
```

(`outcome` deliberately does not reuse the criterion `state` enum:
"rejected" names a transition outcome — the criterion is deleted from the
interchange, history lives in git — not a criterion state. The function
returns a verdict; applying the deletion/activation to the files is the
caller's write, same as verify reports without mutating the ledger.)

### Transition rules (P1–P9)

- **P1** Only a `state: proposed` criterion may be transitioned
  (`E_NOT_PROPOSED` otherwise; promotion is not a cheaper deprecation or
  un-dispute — those have their own rules in it-gating).
  `criterionId` naming no record → `E_UNKNOWN_CRITERION`.
- **P2 — effective decision per implementer.** Acknowledgments are not
  constrained to one per implementer; the effective decision for each
  roster implementer is the **latest valid acknowledgment by `at`, ties
  broken by last submitted** — the same rule as verify's D1, for the same
  reason. A valid acknowledgment satisfies
  `requestedAt <= at <= asOf`; an acknowledgment outside that window is an
  error (`E_BAD_ACK`), not silently ignored — loudness over forgiveness.
- **P3 — to: active (ratification).** Accepted iff every roster implementer
  has either an effective `ack` or has lapsed: no valid decision and
  `asOf > requestedAt + timeoutDays`. Lapsed names are listed in the
  result — liveness is loud, never silent. Acks incomplete and not lapsed
  → `E_PENDING`.
- **P4 — nak blocks; deadlock tiebreaks to the repo owner.** Any effective
  `nak` from a non-repo-owner blocks (`E_VETOED`) *unless* the repo
  owner's effective decision is `ack`, which resolves the deadlock: the
  result is accepted with the nak recorded. The repo owner's own effective
  `nak` is final (`E_VETOED`). If **no** roster entry carries the
  `repo-owner` role, there is no resolver and any nak stands
  (`E_VETOED`). If **more than one** roster entry carries it, the function
  refuses: `E_AMBIGUOUS_OWNER` — it does not guess between owners.
  (Compilation adds the structural guard: lint gains
  `E_MULTIPLE_OWNERS` so a multi-owner roster cannot merge in the first
  place; the promotion-side error keeps the function total even over
  specs that never passed lint.)
- **P5 — solo roster degenerates explicitly.** A roster of one is
  repo-owner authority: that implementer's single effective `ack`
  ratifies. (This is the current felag-core situation; the degeneracy is
  contract, not accident.)
- **P6 — to: rejected is deliberately lighter than ratification.**
  Rejection requires a single effective `ack` from any roster implementer
  and no effective `nak` from the repo owner. Rationale: ratification
  creates obligations for every implementer, so it takes the full roster;
  rejection deletes an inert proposal that never gated anyone, history
  survives in git, and re-proposing is one PR — so one accountable ack
  suffices. (v0 required the full quorum for rejection; review M3
  correctly observed that lets one nak freeze junk proposals as permanent
  clutter, against design v1's lightweight-triage intent.)
- **P7 — to: known-bug.** Same acknowledgment rules as ratification
  (P3–P5), because it *is* a ratification: the criterion activates AND the
  result carries a `kind: known-bug` waiver for
  `transition.implementation`, built entirely from input fields
  (criterionId, implementation, justification, expiresAt, attribution).
  Excavate found real divergent behavior; the spec records the correct
  behavior and the divergence is tracked in the implementation's ledger.
  Missing `implementation`/`justification`/`expiresAt`/`attribution` →
  `E_MISSING_FIELD`.
- **P8 — roster validation.** `requestedBy` and every
  `acknowledgments[].implementer` must name a roster entry
  (`E_NOT_ROSTER`) — governance is the roster, no drive-by ratification.
- **P9 — error composition.** The function evaluates all rules and
  returns every applicable error code, sorted ascending — never
  short-circuits. `accepted: true` iff `errors` is empty.

Error codes: `E_AMBIGUOUS_OWNER`, `E_BAD_ACK`, `E_MISSING_FIELD`,
`E_NOT_PROPOSED`, `E_NOT_ROSTER`, `E_PENDING`, `E_UNKNOWN_CRITERION`,
`E_VETOED`.

### Roster references and the repo-owner role — stated honestly

Design v1.2 made `dispute.by` a roster reference that carries semantics,
as an enumerated exception to "attribution strings have no semantics."
This draft does something **adjacent but new, and bigger than v0 claimed**:
it makes the roster role string `repo-owner` *mechanically* load-bearing
(P4/P5 read it to resolve deadlocks). Two clarifications, both due to
review round 1:

- This is not literally a carve-out from `ac-ver-attribution-opaque` —
  that criterion enumerates `discoveredBy`, verdict provenance, waiver
  authors, and record attribution; roster `roles` are not on its list.
  The honest framing: **roster entries (names and the `repo-owner` role)
  are governance plumbing, a different kind of thing from attribution
  strings.** The compiled spec should say so in one place (a new
  `it-governance` item): attribution = opaque, roster = semantic, and
  the ratified spec already leaned on repo-owner semantics in advisory
  prose (`ac-gate-dispute-resolution`) — this contract is merely the
  first *mechanical* reader.
- **Making `repo-owner` mechanical reclassifies roster-role edits as
  governance-critical.** Design v1 lets roster membership change by
  "ordinary spec PR"; composed naively with P4, an ordinary PR that adds
  `repo-owner` to your roster entry hands you tiebreak authority. The
  contract therefore states: **adding, removing, or moving the
  `repo-owner` role is a MAJOR governance act** requiring the same
  acknowledgment as ratification (P3–P5, evaluated against the roster
  *before* the edit). Plain membership changes (add/remove an implementer
  without that role) remain ordinary PRs. This is the escalation path
  closed deliberately rather than discovered later.

## 3. The interview protocol (author)

The interview itself is conduct: greenfield, delta, and (deferred)
`--from-annotations` flows; the front-loaded questions ("contract or
choice? could a stranger get it wrong? which fixture proves it?"); the
preference for fixtures over checklists. These stay **judgment** — felag
never runs the interview and cannot fixture a dialog.

What gates is the interview's *output*. Wire format
`felag/author-output@0`:
`{ "spec": [records], "budgets": { "criteriaPerItem": int } | absent }`
→ result `{ "valid": boolean, "errors": [{code, ref}] }` (lint's result
shape). **When `budgets` is absent, `criteriaPerItem` defaults to 7; the
default is pinned in this wire format's definition, not in any spec
record** (review M1: v0 said "spec-declared defaults" and declared them
nowhere). Rules:

- **A1** The emitted record set passes lint (all lint codes apply; an
  author implementation that emits unlintable interchange does not
  conform).
- **A2 — scenario budgets.** No item may carry more criteria than the
  effective `criteriaPerItem`. Violation: `E_BUDGET_CRITERIA` naming the
  item. The cap is the protocol's defense against Cucumber-style sprawl,
  so the cap itself must be mechanical.
- **A3 — provenance.** Every emitted criterion carries
  `source: forethought` (greenfield/delta interviews produce forethought;
  `discovered` is excavate's word and an author implementation that emits
  it is lying about provenance). Violation: `E_BAD_PROVENANCE`.

The no-LLM path stays normative and is already covered: hand-written
interchange validated by lint IS an author-output that passes A1–A3.

## 4. The excavate output contract

Excavate reads a repo (outside felag's verifiable boundary — same stance as
verify: felag checks artifacts, not the archaeology). Wire format
`felag/excavate-output@0`:
`{ "scope": { "contracts": [id] } | null, "spec": [records] }`
→ lint-shaped result. (v0 sketched a `scope.surfaces` field consumed by no
rule; cut — a dead field in a wire format is a divergence invitation.)
Rules:

- **X1** `scope` is required and `scope.contracts` non-empty; otherwise
  `E_NO_SCOPE` (the bounded-scoping input from design v1 — unbounded
  excavation is how you mirror a whole repo into a junk-drawer spec).
- **X2** Every emitted criterion is `source: discovered` and
  `state: proposed`, carrying `discoveredAt`, `discoveredBy`,
  `triggeringEvent`. Violations: `E_BAD_PROVENANCE` naming the criterion.
  Excavate output **never gates anyone** — only the promotion protocol can
  activate it.
- **X3** The emitted record set passes lint, and criteria reference only
  contracts named in `scope.contracts` (`E_OUT_OF_SCOPE` otherwise).

## 5. The render protocol

The exclusion list already refuses render aesthetics ("observable but
undeclared, therefore non-core"). What is contractual is **audience
projection** — *what* each audience sees, not how it is typeset. Wire
format `felag/render-inventory@0`: `{ "spec": [records], "audience":
"stakeholder" | "developer" | "verifier" }` → `{ "included": [recordId],
"excludedFields": [string] }`. **Both result fields are exact sets**
(sorted ascending; equality, not subset — review M1: v0 mixed "matches"
with "must cover" and two compilers would diverge). A conforming render
implementation must produce a document whose content inventory equals the
expected value:

- **R1 — stakeholder**: every item and every non-deprecated criterion (ids
  in `included`), human text only — `excludedFields` is exactly
  `["contractId", "fixtures", "judgment"]`. **Criteria appear with their
  state, and non-`active` states are marked loudly: a `proposed` criterion
  rendered as if ratified is the render-side version of asserting bare
  conformance** (review M1: v0 applied loud-everywhere to `disputed` only;
  showing un-ratified criteria to stakeholders unmarked is the more
  dangerous case). Disputed criteria appear with their dispute.
- **R2 — developer**: stakeholder content plus contracts, fixtures, and
  Profile/Binding references; `excludedFields` is exactly `[]`.
- **R3 — verifier**: the identity projection — every record id in
  `included`, `excludedFields` `[]`. (`render --audience verifier` and the
  interchange file say the same thing; this pins it.)
- **R4** Renders are one-way artifacts: a render is never input to any
  felag verb except (future) `author --from-annotations`. No verb in this
  contract accepts markdown.

The *language quality* of the stakeholder render ("observable language",
no implementation jargon) stays **judgment** — fixturing prose style would
pin aesthetics, which the exclusions forbid.

## 6. Prime

`prime` emits the protocols, vendor-neutral. Mechanical half: wire format
`felag/prime-output@0`: `{ "spec": [records], "output": string }` →
lint-shaped result. The emitted document must contain, verbatim
(substring), the `body` of every **protocol item**, where a protocol item
is defined mechanically as: **an item with at least one criterion whose
`contractId` is `c-author`** (review M1: items carry no contract
membership in the data model, so v0's "items under the c-author contract"
was undefined; this derivation is computable from the records). Missing
body → `E_MISSING_PROTOCOL` naming the item. Judgment half:
vendor-neutrality of any added framing — already covered by the existing
`ac-class-vendor-neutral` judgment criterion; prime adds no new judgment
surface.

## 7. Landing strategy: one honest MAJOR, then proposed-state MINORs

v0 claimed the landing was MINOR because the new criteria are
`state: proposed`. Review H1 demolished this: the ratified `ac-vers-major`
says "adds a MUST criterion ⇒ MAJOR" **unconditional on state**, and using
a not-yet-ratified "proposed ⇒ MINOR" exception to classify the change
that introduces it is circular. The honest sequence:

- **The landing is MAJOR: felag-core 0.2.0 → 1.0.0.** It adds MUST
  criteria under the rules in force (unconditional ac-vers-major), amends
  `ac-vers-major`/`ac-vers-minor-patch` to add the state distinction
  (*adding criteria in `state: proposed` is MINOR — they are inert until
  ratified; ratifying a proposed MUST to `active` is MAJOR — that is the
  moment gating obligations change*), adds the `it-governance` item
  (roster semantics, repo-owner edit rule), adds lint
  `E_MULTIPLE_OWNERS`, and lands `c-author` with all its criteria
  `state: proposed`. MAJOR requires roster acknowledgment — solo roster,
  P5 degeneracy, Jonathan's merge IS the ack.
- **Thereafter, proposed-state additions are MINOR** under the amended
  rule — the exception classifies future changes, never its own
  introduction.
- **Ratification of the c-author criteria is a second, later MAJOR**
  (proposed MUST → active), executed *through* the promotion protocol
  itself once a felag/author implementation exists and passes the fixture
  corpus — the contract enters through its own front door, and the spec's
  version number tells the truth at every step: at 1.0.0 the author class
  has a published contract that gates no one; at 2.0.0 it gates.
- **Honesty about the interim** (review M2): between landing and
  ratification, `felag/author` remains exactly as un-gated as today —
  `ac-class-declaration` yields an empty gating set for the class. What
  the landing delivers is the *contract and its fixtures as reviewable,
  committed, proposed records* — the difference between "no contract"
  (F7) and "a contract awaiting ratification" is the entire reviewable
  surface of this draft.
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
- **Waiver expiry policy** — P7's waiver carries `expiresAt` from the
  promotion input; how an implementation's ledger *chooses* expiry
  durations is ledger policy, outside this spec (named here because v0
  leaned on "the ledger's normal rules", which do not exist — review L2).
- ~~Absent repo-owner deadlock~~ — no longer deferred: defined in P4 (no
  owner ⇒ any nak stands).

## 9. Compilation checklist (the follow-up task)

New preamble contract `c-author`; new item `it-governance` (roster
semantics: attribution opaque vs roster semantic, repo-owner edit = MAJOR
act); items `it-author-interview`, `it-author-excavate`,
`it-author-render`, `it-author-promotion` (A/X/R/P rule blocks as bodies);
~10–12 behavioral `state: proposed` criteria with fixtures across the five
wire formats (promotion needs the largest corpus: ratify-clean, lapse,
nak-veto, owner-tiebreak, owner-nak-final, no-owner, multi-owner refuse,
conflicting-acks-latest-wins, bad-ack-window, rejected-single-ack,
known-bug-waiver, pending); 2 judgment criteria (conduct, stakeholder
language); schema.json `$defs` for the five wire formats; amend
`ac-vers-major`/`ac-vers-minor-patch` (state distinction); lint
`E_MULTIPLE_OWNERS`; update it-classes and the preamble exclusions
(author exclusion shrinks to `--from-annotations` + conduct). Version:
0.2.0 → 1.0.0. felag-ts implements the five validators (small pure
functions) in a follow-up; until then felag-ts's declared classes
(interchange, verifier) keep its verdict unaffected.

---

## Cold review round 1 — disposition

| Finding | Disposition |
|---|---|
| C1 conflicting/duplicate acks undefined | **Fixed** — P2: effective decision = latest valid by `at`, ties last-submitted (mirrors verify D1) |
| C1 P6 waiver fields unsourced (expiresAt, attribution) | **Fixed** — both are required transition inputs iff known-bug; function now pure |
| C1 known-bug quorum unstated | **Fixed** — P7: same rules as ratification, because it is one |
| C1 multiple repo-owners undefined | **Fixed** — P4: `E_AMBIGUOUS_OWNER`; lint `E_MULTIPLE_OWNERS` at compilation |
| H1 MINOR landing circular; MUST edits smuggled | **Accepted** — landing is MAJOR (1.0.0); exception classifies only future changes; ratification is a second MAJOR |
| H2 repo-owner escalation via ordinary roster PR | **Fixed** — repo-owner role edits are MAJOR governance acts (it-governance); framing corrected: first *mechanical* reader, not a second carve-out; no conflict with ac-ver-attribution-opaque |
| M1 prime "items under contract" undefined | **Fixed** — protocol item := item owning ≥1 c-author criterion |
| M1 render equality vs subset; `state` unaddressed | **Fixed** — exact sets; states rendered, non-active marked loudly |
| M1 excavate `scope.surfaces` dead field | **Fixed** — cut |
| M1 budget default source unspecified | **Fixed** — default 7 pinned in the wire format definition |
| M2 mechanical-now vs inert-until-ratified oscillation | **Fixed** — §7 states the interim honestly; §1 no longer relabels ac-class-author-labeled |
| M3 rejection quorum freezes junk; resultingState token | **Fixed** — P6 single-ack rejection with owner veto; result field renamed `outcome` |
| L1 ack timing, requestedBy validation, error composition | **Fixed** — P2 validity window + E_BAD_ACK; P8 roster check on requestedBy; P9 all-applicable errors |
| L2 unnamed dependencies (waiver expiry, absent owner) | **Fixed** — expiry policy named as refusal; absent owner defined in P4 |
