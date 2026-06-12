# felag/author class contract — design draft v0.3

*2026-06-12. Closes F7 of [compilation-findings-v0](compilation-findings-v0.md):
`felag/author` is a conformance class with verbs (`author`, `excavate`,
`render`, `prime`), a label ("partially judgment-verified"), and no contract.
This draft specifies the interview, promotion, and render protocols to the
point where the class is verifiable, and states exactly which surfaces gate
mechanically versus remain judgment. Authority note: this prose is a draft
membrane per design v1.2 — when compiled, the spec records are normative and
this document is history.*

*Revision history (same day): v0.1 folded cold review round 1 (14 findings;
promotion non-totality, circular MINOR landing, thin wire formats). v0.2
folds round 2 (independent error predicates; A3 scoped to new criteria;
known-bug reconciled with excavate; normative-text versioning hole closed;
timeout committed). v0.3 folds round 3 (G0 lint-validity guard — the
totality claim was falsifiable via duplicate ids; acknowledgments bound to
criterion text by hash; item-body normative text classified by versioning;
role-edit governance honestly relabeled social; render audiences made
genuinely distinct). Disposition tables at the end.*

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
| Stakeholder-render language quality | prose quality | judgment |
| `--from-annotations` round-trip | needs an annotation format that does not exist | **excluded** (deferred) |

The pattern is the one felag already uses for `verify`: felag never runs the
interview, just as verify never runs the implementation. The contract binds
the *artifacts* the verbs produce, and artifacts are fixturable.

The existing `ac-class-author-labeled` criterion ("author-class conformance
is partially judgment-verified, on its face") **stays as written**: it
remains literally true after this contract — conduct is judgment,
permanently. This draft shrinks the judgment share without eliminating it.

## 2. The promotion protocol (the load-bearing piece)

Design v1 states the governance rules in prose (roster acknowledgment,
30-day lapse, solo-roster degeneracy, repo-owner tiebreak) and the
compilation's F6 found them unenforceable. The promotion protocol fixes the
half of F6 that is fixable: ratification becomes a total, deterministic,
fixturable function. **Totality is achieved by construction**: after three
structural guards, every error code is an independent predicate over the
input; the result's `errors` is the sorted set of all predicates that hold.
There are no rule-interaction cases to enumerate because rules do not
interact (review round 2, C-1: the v0.1 rule-list left nak-vs-pending and
guard-ordering overlaps undefined; round 3, C3-1: a guard for spec
lint-validity, without which "the target criterion" is not well-defined
under duplicate ids).

### The roster's declared timeout becomes committed

Design v1 and `ac-gate-dispute-resolution` say "the roster's declared
timeout (default 30 days)", but no preamble field declares it — so v0.1
took it as a loose input, making the same committed spec ratify
differently under different parameters (round 2, M-2). Fix: the preamble
gains an optional `governance` object: `{ "timeoutDays": int >= 1 }`,
default `{ "timeoutDays": 30 }` when absent. The promotion function is a
pure function of exactly **(spec, transition, asOf)** — every governance
parameter is committed.

### Wire format `felag/promotion-input@0`

One JSON object — `{ "asOf", "spec", "transition" }`:

```
{
  "asOf":        ISO timestamp — evaluation clock (same role as in verify-input),
  "spec":        concatenated parsed records (roster and governance live in the preamble),
  "transition": {
    "criterionId":   id of a state: proposed criterion,
    "to":            "active" | "rejected" | "known-bug",
    "requestedAt":   ISO timestamp — starts the lapse clock,
    "requestedBy":   roster reference (validated, E_NOT_ROSTER),
    "implementation": required iff to = known-bug — whose ledger gets the waiver.
                      An OPAQUE implementation name, deliberately NOT
                      roster-validated: waivers are per-implementation and
                      implementations are a different namespace from the
                      governance roster (a third party can carry a known-bug),
    "justification":  required iff to = known-bug,
    "expiresAt":      required iff to = known-bug — the waiver's expiry,
    "attribution":    required iff to = known-bug — the waiver's attribution string,
    "acknowledgments": [ { "implementer": roster reference,
                           "decision": "ack" | "nak",
                           "at": ISO timestamp,
                           "criterionHash": CS9 hash of the criterion's
                               canonical record line AS ACKNOWLEDGED } ]
  }
}
```

`criterionHash` binds each acknowledgment to the text it endorses, exactly
as VerificationRecords carry `fixtureHash` (round 3, C3-3: without it,
amending a proposed criterion mid-window silently re-points old acks at
text nobody saw — the staleness guard the rest of felag already has).

### Result format `felag/promotion-result@0`

```
{
  "accepted": boolean,           // true iff errors is empty
  "errors":   [code],            // ALL holding predicates, sorted ascending
  "outcome":  "ratified" | "rejected" | null,
  "lapsed":   [roster name],     // sorted ascending (round 2, M-6) — loud
  "stale":    [roster name],     // sorted ascending — implementers whose only
                                 // acknowledgments are stale (hash mismatch);
                                 // ignored for decisions, loud here (D1 convention)
  "waiver":   Waiver | null      // emitted iff to = known-bug and accepted
}
```

(`outcome` deliberately does not reuse the criterion `state` enum:
"rejected" names a transition outcome — the criterion is deleted from the
interchange, history lives in git — not a criterion state. The function
returns a verdict; applying the deletion/activation to the files is the
caller's write, same as verify reports without mutating the ledger.)

### Definitions

- **Valid** acknowledgment: `requestedAt <= at <= asOf`. Violation is loud
  (`E_BAD_ACK`).
- **Stale** acknowledgment: valid, but `criterionHash` differs from the
  target criterion's current canonical hash (CS9). Stale acknowledgments
  are **ignored for effective decisions and listed in `stale`** — the D1
  convention: an amendment resets endorsement without poisoning the input,
  and the reset is visible, never silent.
- **Effective decision** (per roster implementer): the latest valid,
  non-stale acknowledgment by `at`; ties broken by greatest array index
  ("last submitted" = position in `acknowledgments`, round 2 L-1).
  An implementer may have no effective decision.
- **Lapsed** (per roster implementer): no effective decision and
  `asOf > requestedAt + timeoutDays`.
- **The owner's effective decision** is three-valued — `ack`, `nak`, or
  `none` (round 3, C3-7: prose gloss is not a definition). It is `none`
  when the unique owner has no effective decision, **and also when no
  unique owner exists** (zero or multiple `repo-owner` roles — no tiebreak
  available; the multiple case additionally errors `E_AMBIGUOUS_OWNER`).

### Evaluation

Three structural guards, then independent predicates. Each guard returns
the full result object `{accepted: false, errors: [<guard code>],
outcome: null, lapsed: [], stale: [], waiver: null}` and stops evaluation:

- **G1** Input fails the wire-format schema → `["E_SCHEMA"]` (mirrors
  ingest).
- **G2** `spec` is not lint-valid (including the two roster checks lint
  gains at compilation: `E_MULTIPLE_OWNERS`, `E_DUPLICATE_IMPLEMENTER`) →
  `["E_SPEC_INVALID"]`. (Round 3, C3-1: without this guard, "the target
  criterion" and "the roster entry named X" are not well-defined — a
  schema-valid spec with duplicate criterion ids or duplicate roster names
  slips JSON Schema and makes two correct implementations diverge.
  Lint-validity was an unstated precondition; unstated preconditions are
  the divergence class felag exists to eliminate, so it is a guard, not an
  assumption. Fixture inputs are adversarial and need not be committed
  specs.)
- **G3** `criterionId` names no criterion record →
  `["E_UNKNOWN_CRITERION"]` (state-dependent predicates have no subject).

Otherwise `errors` = sorted set of every holding predicate:

| Code | Predicate |
|---|---|
| `E_NOT_PROPOSED` | the target criterion's `state` is not `proposed` |
| `E_BAD_REQUEST` | `requestedAt > asOf` (temporally incoherent request; round 2 L-2) |
| `E_NOT_ROSTER` | `requestedBy`, or any `acknowledgments[].implementer`, names no roster entry |
| `E_BAD_ACK` | any acknowledgment is invalid (`at` outside `[requestedAt, asOf]`) — loud, never silently ignored |
| `E_AMBIGUOUS_OWNER` | more than one roster entry carries role `repo-owner` |
| `E_MISSING_FIELD` | `to = known-bug` and any of `implementation` / `justification` / `expiresAt` / `attribution` is absent |
| `E_VETOED` | **to = active or known-bug:** the owner's effective decision is `nak`; OR a non-owner's effective decision is `nak` and the owner's effective decision is `nak` **or `none`** (three-valued, explicit: with no unique owner there is no tiebreak and any nak stands; only an owner `ack` overrides). **to = rejected:** the owner's effective decision is `nak` |
| `E_PENDING` | **to = active or known-bug:** some roster implementer has neither an effective decision nor lapsed. **to = rejected:** no roster implementer's effective decision is `ack` (round 2, H-1: zero-ack rejection now has a defined code) |

`E_VETOED` and `E_PENDING` co-fire when both hold — all-applicable
composition, same convention as lint. `accepted` iff `errors` empty;
`outcome` is `"ratified"` for accepted active/known-bug, `"rejected"` for
accepted rejected, else `null`; `waiver` is built entirely from input
fields for accepted known-bug.

The acceptance conditions in prose (they are the predicates' complement,
restated for the reader):

- **Ratification (active, known-bug)** — every roster implementer either
  effectively acks or lapses; a non-owner nak is overridden only by an
  owner ack (deadlock tiebreak); the owner's nak is final; with no unique
  owner there is no tiebreak and any nak stands. Solo roster degenerates
  to repo-owner authority: one valid ack ratifies (the current felag-core
  situation; degeneracy is contract, not accident).
- **Rejection** — deliberately lighter: one effective ack from any roster
  implementer, no owner nak. Ratification creates obligations for every
  implementer, so it takes the full roster; rejection deletes an inert
  proposal that never gated anyone, history survives in git, re-proposing
  is one PR.
- **Known-bug** — a ratification plus a waiver (see the excavate
  reconciliation below).

### Known-bug reconciled with the excavate model (round 2, H-5)

Round 2 found a real contradiction: excavate proposes criteria mirroring
*current* behavior, so ratifying a mirrored criterion with a waiver would
be vacuous — the implementation passes its own mirror. The resolution,
now stated as contract: **the known-bug path presupposes triage amended
the proposed criterion to state the correct behavior.** Proposed criteria
are inert; editing one is an ordinary spec PR (it gates nobody — this is
exactly what `proposed` is for). The triage sequence for a discovered
bug: excavate emits the mirror (`proposed`); review recognizes the mirror
describes a bug; the proposal is amended in place to the correct
behavior; the amended proposal ratifies via `to: known-bug`, which
activates it AND records the divergence as a `kind: known-bug` waiver for
the named implementation. The waiver is non-vacuous because verification
runs against the corrected text. Design v1's "bugs become tracked
divergences, never MUSTs" reads precisely: the *bug* never becomes a
MUST; the *correct behavior* does, with the bug tracked in the ledger.
The `criterionHash` binding closes the authorization loop (round 3,
C3-3): any acknowledgment given before the amendment is stale against the
corrected text and cannot ratify it — the acks that activate a criterion
are provably acks of the text that activates.

### Roster references and the repo-owner role — stated honestly

Design v1.2 made `dispute.by` a roster reference that carries semantics.
This draft does something adjacent but new: it makes the roster role
string `repo-owner` *mechanically* load-bearing (the tiebreak clauses
read it). Three commitments, the first two due to round 1, the third to
round 2:

- **Not an attribution carve-out.** `ac-ver-attribution-opaque`
  enumerates `discoveredBy`, verdict provenance, waiver authors, record
  attribution — roster `roles` are not on its list. The honest framing:
  roster entries (names and the `repo-owner` role) are **governance
  plumbing**, a different kind of thing from attribution strings. The
  compiled spec says so in one place (new `it-governance` item):
  attribution = opaque, roster = semantic. The ratified spec already
  leaned on repo-owner semantics in advisory prose
  (`ac-gate-dispute-resolution`); this contract is the first *mechanical*
  reader.
- **Repo-owner role edits are governance acts, explicitly overriding
  design v1's "roster membership is maintained by ordinary spec PR" for
  this one case** (the override is stated, not implied): adding,
  removing, or moving the `repo-owner` role requires ratification-grade
  acknowledgment. Plain membership changes (add/remove an implementer
  without that role) remain ordinary PRs.
- **The owner cannot veto their own demotion, and this rule is social,
  not mechanical — stated honestly** (round 2, M-5; round 3, C3-4). For a
  repo-owner role edit, acknowledgment is required from all roster
  implementers **except the entry whose role changes**, and that entry's
  nak records loudly but does not veto — the same all-but-the-affected
  shape as dispute resolution. Solo roster: degenerate, the owner edits
  freely. Round 3 correctly observed this quorum differs from the
  promotion function's (it excludes the affected entry) and a role edit
  is a preamble change, not a criterion transition — the promotion
  function has no input shape for it. **At 1.0.0 this rule ships as a
  judgment-class criterion under it-governance**: merge-gated social
  governance, reviewed by humans on the PR, not computed by a function.
  Mechanizing it (a `to: role-edit` transition variant with its own
  predicates) is named future work, taken only if multi-implementer
  rosters materialize. One F6-shaped rule survives, labeled as what it
  is, rather than a fake-mechanical rule with no function behind it.
  Residual risk accepted and named: in a two-entry roster the other
  implementer alone can strip the role — but a role edit is still a spec
  PR, and merge rights on the repo remain the outer gate.

## 3. The interview protocol (author)

The interview itself is conduct: greenfield, delta, and (deferred)
`--from-annotations` flows; the front-loaded questions ("contract or
choice? could a stranger get it wrong? which fixture proves it?"); the
preference for fixtures over checklists. These stay **judgment** — felag
never runs the interview and cannot fixture a dialog.

What gates is the interview's *output*. Wire format
`felag/author-output@0`:
`{ "spec": [records], "new": [criterionId], "budgets": { "criteriaPerItem": int } | absent }`
→ result `{ "valid": boolean, "errors": [{code, ref}] }` (lint's result
shape). `spec` is the complete post-interview record set; `new` lists the
criteria this interview authored (round 2, H-3: v0.1 applied the
provenance rule to *every* criterion, which is jointly unsatisfiable with
lint-validity for any delta interview on a spec containing
ratified-from-excavate `discovered` criteria — carried-through records
keep their provenance). When `budgets` is absent, `criteriaPerItem`
defaults to 7; **the default is pinned in this wire format's definition,
not in any spec record.** Rules:

- **A1** The emitted record set passes lint (all lint codes apply; an
  author implementation that emits unlintable interchange does not
  conform).
- **A2 — scenario budgets.** No item may carry more criteria than the
  effective `criteriaPerItem`. Violation: `E_BUDGET_CRITERIA` naming the
  item. The cap is the protocol's defense against Cucumber-style sprawl,
  so the cap itself must be mechanical.
- **A3 — provenance of new work.** Every criterion listed in `new`
  carries `source: forethought` (interviews produce forethought;
  `discovered` is excavate's word and an author implementation that emits
  it for interview output is lying about provenance). A `new` id naming
  no criterion in `spec` → `E_UNKNOWN_CRITERION`. Violation:
  `E_BAD_PROVENANCE` naming the criterion.

The no-LLM path stays normative and is already covered: hand-written
interchange validated by lint IS an author-output that passes A1–A3.

## 4. The excavate output contract

Excavate reads a repo (outside felag's verifiable boundary — same stance as
verify: felag checks artifacts, not the archaeology). Wire format
`felag/excavate-output@0`:
`{ "scope": { "contracts": [id] } | null, "spec": [records] }`
→ lint-shaped result. Rules:

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
projection** — *what* each audience sees, not how it is typeset.

Wire format `felag/render-inventory@0`: `{ "spec": [records], "audience":
"stakeholder" | "developer" | "verifier" }` → `{ "included": [recordId],
"excludedFields": [string] }`. Both result fields are **exact sets, sorted
ascending** (equality, not subset). `included` ranges over id-bearing
records — items, criteria, fixtures; **the preamble has no id and is
included for every audience by definition** (round 2, M-3: v0.1's
developer audience named contracts and Profile/Binding, which have no
record ids — contracts are preamble fields, covered by the
preamble-always rule; Profile and Binding are separate artifacts that
ship with implementations, not spec records, and rendering them is
**cut from this contract** — deferred alongside the formats themselves).

- **R1 — stakeholder**: `included` = every item and every non-deprecated
  criterion; `excludedFields` = exactly
  `["class", "contractId", "discoveredAt", "discoveredBy", "fixtures",
  "interfaceSketch", "itemId", "judgment", "source", "triggeringEvent",
  "type"]` — the machine plumbing **and the provenance triplet** (round
  3, C3-6: attribution strings and excavation forensics are not
  stakeholder content by the list's own rationale; `interfaceSketch` is
  non-normative developer scaffolding). Retained: criterion text
  (`gherkin`/`item`), `force` (MUST/SHOULD/MAY is
  stakeholder-meaningful), `dispute`, and `state`: **criteria render with
  their state, and non-`active` states are marked loudly — a `proposed`
  criterion rendered as if ratified is the render-side version of
  asserting bare conformance.** (Round 2, M-4: the exact list replaces
  the "human text only" prose phrase; the list IS the definition.
  `excludedFields` is a single flat list of field names applied across
  record types.)
- **R2 — developer**: `included` = every item, every **non-deprecated**
  criterion, every fixture; `excludedFields` = exactly `[]`. The working
  view: full contract surface, no retired history.
- **R3 — verifier**: the identity projection — `included` = every
  id-bearing record **including deprecated criteria**; `excludedFields` =
  exactly `[]`. (`render --audience verifier` and the interchange file
  say the same thing; this pins it. Round 3, C3-5: v0.2's R2 and R3 were
  set-identical for every spec while claiming to diverge; now R1/R2
  diverge on fixtures and plumbing, R2/R3 on deprecation history.)
- **R4** Renders are one-way artifacts: a render is never input to any
  felag verb except (future) `author --from-annotations`. No verb in this
  contract accepts markdown.

(R2 and R3 produce the same inventory exactly for a spec with no
deprecated criteria; they diverge the moment deprecation history exists.)

The *language quality* of the stakeholder render ("observable language",
no implementation jargon) stays **judgment** — fixturing prose style would
pin aesthetics, which the exclusions forbid.

## 6. Prime

`prime` emits the protocols, vendor-neutral. Mechanical half: wire format
`felag/prime-output@0`: `{ "spec": [records], "output": string }` →
lint-shaped result. The emitted document must contain, verbatim
(substring), the `body` of every **protocol item**, where a protocol item
is defined mechanically as: **an item with at least one criterion whose
`contractId` is `c-author`**. Missing body → `E_MISSING_PROTOCOL` naming
the item. Judgment half: vendor-neutrality of any added framing — already
covered by the existing `ac-class-vendor-neutral` judgment criterion;
prime adds no new judgment surface.

## 7. Landing strategy: one honest MAJOR, then proposed-state MINORs

The honest sequence (round 1, H1; round 2, H-4 and L-4):

- **The landing is MAJOR: felag-core 0.2.0 → 1.0.0.** It adds MUST
  criteria under the rules in force (unconditional `ac-vers-major`), and
  in the same act amends the versioning criteria with **two**
  clarifications:
  1. *State distinction*: adding criteria in `state: proposed` is MINOR —
     they are inert until ratified; ratifying a proposed MUST to `active`
     is MAJOR — that is the moment gating obligations change. Ratifying a
     proposed **SHOULD or MAY** is MINOR, consistent with "additive
     SHOULD/MAY = MINOR" (round 3, C3-10).
  2. *Normative-text edits* (round 2, H-4: classified by nothing today):
     materially changing normative text is MAJOR whether it lives in an
     **active MUST criterion's `gherkin`/`item` or in an item `body`
     carrying algorithm or rule text** (CS1–CS9, D1–D6, the promotion
     guards and predicate table) — same logic as fixture edits, "a
     behavior change wearing a test's clothes." Round 3, C3-2: v0.2
     classified only criterion fields while this draft deliberately puts
     its most behavior-defining text in item bodies, exactly as
     it-interchange carries CS1–CS9; the rule must reach where the
     normativity actually lives. Editing a **proposed** criterion's text
     is MINOR (inert; the known-bug triage path depends on it being
     routine — and `criterionHash` staleness makes it safe). Pure
     clarification prose in bodies remains PATCH; the MUST/PATCH line is
     whether any conforming implementation's obligations change.
  The landing also adds the `it-governance` item, lint
  `E_MULTIPLE_OWNERS`, the preamble `governance` field, and `c-author`
  with all its criteria `state: proposed`.
- **Authority for the landing**: design v1's governance section as
  ratified — solo roster degenerates to repo-owner authority, so
  Jonathan's merge is the acknowledgment. (Round 2, L-4: v0.1 cited P5 —
  a not-yet-in-force rule introduced by the landing itself — the same
  circular shape as the MINOR claim. The in-force authority is v1.)
- **Thereafter, proposed-state additions are MINOR** under the amended
  rule — the exception classifies future changes, never its own
  introduction.
- **Ratification of the c-author criteria is a second, later MAJOR**
  (proposed MUST → active), executed *through* the promotion protocol
  itself once a felag/author implementation exists and passes the fixture
  corpus — the contract enters through its own front door, and the spec's
  version number tells the truth at every step: at 1.0.0 the author class
  has a published contract that gates no one; at 2.0.0 it gates.
- **Honesty about the interim**: between landing and ratification,
  `felag/author` remains exactly as un-gated as today —
  `ac-class-declaration` yields an empty gating set for the class. What
  the landing delivers is the *contract and its fixtures as reviewable,
  committed, proposed records* — the difference between "no contract"
  (F7) and "a contract awaiting ratification" is the entire reviewable
  surface of this draft.
- Fixtures land WITH the proposed criteria (lint's `E_MISSING_FIXTURES`
  is state-independent, deliberately: a proposal without its interop
  proof is not reviewable).

## 8. What this draft refuses

- **`--from-annotations`** — needs an annotation format; specifying it here
  would be a second spec's worth of surface. Stays in the exclusion list
  with one sentence naming the dependency.
- **Interview conduct fixtures** — felag does not run interviews; conduct
  is judgment, permanently, by the same reasoning that verify is a ledger.
- **Render aesthetics** — already excluded; R1–R3 pin selection, never
  typesetting.
- **Profile/Binding rendering** — those artifacts ship with
  implementations, not specs; rendering them waits for their formats to be
  contract surface (round 2, M-3).
- **Judgment-criterion graduation** — the c-author judgment criteria
  (conduct, stakeholder language) ship advisory with no graduation bar,
  same as the existing judgment criteria. Writing the graduation bar is
  its own future contract.
- **Waiver expiry policy** — P-known-bug's waiver carries `expiresAt` from
  the promotion input; how an implementation's ledger *chooses* expiry
  durations is ledger policy, outside this spec.

## 9. Compilation checklist (the follow-up task)

New preamble contract `c-author` and optional `governance.timeoutDays`
field; new item `it-governance` (attribution opaque vs roster semantic;
repo-owner edit rules incl. the no-self-veto clause as a
**judgment-class criterion** — social, merge-gated, stated as an explicit
override of v1's ordinary-PR roster rule); items `it-author-interview`,
`it-author-excavate`, `it-author-render`, `it-author-promotion` (A/X/R +
definitions/guards/predicate-table as bodies); ~12 behavioral
`state: proposed` criteria with fixtures across the **six** wire formats
(promotion-input, promotion-result, author-output, excavate-output,
render-inventory, prime-output — roughly ten `$defs` counting result
shapes, each verb's result a **new** def whose `code` enum is the union
of lint codes and the verb's own codes, NOT a reuse of the closed
`lintResult` def; round 3, C3-8). Promotion needs the largest corpus:
ratify-clean, lapse, nak-veto, owner-tiebreak, owner-nak-final,
no-owner-nak-stands, multi-owner (`E_AMBIGUOUS_OWNER`),
conflicting-acks-latest-wins, same-at-tie (array index), bad-ack-window,
**stale-ack-ignored-and-listed**, bad-request, rejected-single-ack,
rejected-zero-acks (`E_PENDING`), known-bug-waiver,
known-bug-missing-fields, pending-and-vetoed-co-fire, schema-guard (G1),
**spec-invalid-guard (G2)**, unknown-criterion (G3). Plus 3 judgment
criteria (conduct, stakeholder language, role-edit governance);
acknowledgment schema carries required `criterionHash`; amend
`ac-vers-major`/`ac-vers-minor-patch` (state distinction incl.
SHOULD/MAY ratification + normative-text rule covering item bodies); lint
gains `E_MULTIPLE_OWNERS` and `E_DUPLICATE_IMPLEMENTER` **each with its
fixture** (state-independent fixture rule applies); update it-classes and
the preamble exclusions (author exclusion shrinks to `--from-annotations`
+ conduct + Profile/Binding rendering). Version: 0.2.0 → 1.0.0. felag-ts
implements the validators (small pure functions) in a follow-up; until
then felag-ts's declared classes (interchange, verifier) keep its verdict
unaffected.

---

## Cold review round 1 — disposition

| Finding | Disposition |
|---|---|
| C1 conflicting/duplicate acks undefined | **Fixed** — effective decision = latest valid by `at`, ties by array index |
| C1 P6 waiver fields unsourced | **Fixed** — required transition inputs iff known-bug |
| C1 known-bug quorum unstated | **Fixed** — ratification rules, because it is one |
| C1 multiple repo-owners undefined | **Fixed** — `E_AMBIGUOUS_OWNER` + lint `E_MULTIPLE_OWNERS` |
| H1 MINOR landing circular | **Accepted** — landing is MAJOR (1.0.0) |
| H2 repo-owner escalation via ordinary PR | **Fixed** — role edits are governance acts (it-governance) |
| M1 four thin wire-format sketches | **Fixed** — pinned (see v0.1) |
| M2 mechanical-now vs inert oscillation | **Fixed** — §7 interim honesty |
| M3 rejection quorum too heavy | **Fixed** — single-ack rejection |
| L1/L2 ack windows, error composition, deps | **Fixed** |

## Cold review round 2 — disposition

| Finding | Disposition |
|---|---|
| C-1 error composition still underdefined (nak-vs-pending, guard order, input schema) | **Fixed** — function restructured: G1/G2 guards + independent predicates; all-applicable union; `E_VETOED`/`E_PENDING` co-fire by definition |
| H-1 rejected with zero acks has no code | **Fixed** — `E_PENDING` predicate covers rejection's no-ack case |
| H-3 A3 unsatisfiable with A1 for delta interviews | **Fixed** — `new: [criterionId]` input; A3 scopes to newly-authored criteria |
| H-4 normative-text edits unclassified by versioning | **Fixed** — amended ac-vers-major: active-MUST text edit = MAJOR, proposed text edit = MINOR |
| H-5 known-bug contradicts excavate-mirrors-current | **Fixed** — triage amends the proposal to correct behavior before known-bug ratification; stated as contract |
| M-1 `transition.implementation` roster membership undefined | **Fixed** — opaque name, NOT roster-validated, stated in the wire format |
| M-2 `timeoutDays` loose input vs "roster-declared" | **Fixed** — preamble `governance.timeoutDays` (default 30); function is (spec, transition, asOf) |
| M-3 developer/verifier `included` cannot express contracts/Profile/Binding | **Fixed** — preamble always included by definition; Profile/Binding rendering cut (named refusal) |
| M-4 stakeholder "human text only" vs 3-field exclusion | **Fixed** — exact 6-field exclusion list replaces the prose phrase |
| M-5 owner can veto own demotion (capture path) | **Fixed** — all-but-the-affected acknowledgment for role edits; owner nak loud but non-veto |
| M-6 `lapsed` ordering | **Fixed** — sorted ascending |
| L-1 tie-break convention unstated | **Fixed** — array index, stated; tie fixture in checklist |
| L-2 `requestedAt > asOf` unguarded | **Fixed** — `E_BAD_REQUEST` predicate |
| L-3 `E_MULTIPLE_OWNERS` fixture omitted | **Fixed** — in checklist |
| L-4 §7 cites P5 to authorize its own landing | **Fixed** — authority cited to design v1's ratified governance |

## Cold review round 3 — disposition

| Finding | Disposition |
|---|---|
| C3-1 duplicate ids / duplicate roster names slip G1+G2; totality falsified | **Fixed** — new guard G2: spec must be lint-valid → `E_SPEC_INVALID` alone; lint gains `E_DUPLICATE_IMPLEMENTER`; guards renumbered G1/G2/G3 |
| C3-2 promotion algorithm lives in item bodies the versioning amendment doesn't reach | **Fixed** — clause 2 extends to normative item-body text (CS/D/promotion rules); MUST/PATCH line = do obligations change |
| C3-3 acks not bound to text; amend-mid-window ratifies unseen text | **Fixed** — required `criterionHash` per acknowledgment; stale acks ignored for decisions, listed in `stale` (D1 convention); closes the known-bug authorization loop |
| C3-4 no-self-veto rule has no mechanical home | **Accepted & relabeled** — ships as a judgment-class criterion under it-governance: social, merge-gated; `to: role-edit` mechanization named future work. One F6-shaped rule survives, labeled honestly |
| C3-5 R2 ≡ R3 while claiming divergence | **Fixed** — R2 excludes deprecated criteria (working view); R3 is the identity incl. deprecated |
| C3-6 stakeholder list retains provenance triplet | **Fixed** — exclusion list now 11 fields incl. discoveredAt/discoveredBy/triggeringEvent/itemId/interfaceSketch |
| C3-7 no-owner `E_VETOED` reading ambiguous | **Fixed** — owner's effective decision defined three-valued (ack/nak/none); predicate spells out `nak or none` |
| C3-8 format miscount; lintResult def reuse impossible | **Fixed** — six formats / ~10 `$defs`; union-enum result defs, stated in checklist |
| C3-9 G2 result object underspecified | **Fixed** — all guards return the full result object, stated once |
| C3-10 proposed SHOULD/MAY ratification unclassified | **Fixed** — MINOR, consistent with additive SHOULD/MAY |
