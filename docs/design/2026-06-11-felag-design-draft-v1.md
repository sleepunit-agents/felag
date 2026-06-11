# felag — design draft v1

*2026-06-11. Supersedes [draft v0](2026-06-11-felag-spec-format-design-draft.md).
v1 folds in the [context-stripped cold review](reviews/2026-06-11-cold-review-fable5-bare.md);
every Critical/High finding received a decision. Disposition table at the end.*

---

## Motivation (not a design commitment)

félag — Old Norse *fé* (property) + *lag* (a laying-together): a fellowship
formed by laying assets into common stock; the root of English "fellow."

We believe spec distribution will shortly matter more than source
distribution: the scarce artifact is the precise, verifiable statement of
what a thing must do, because competent agents can produce implementations
from it. felag is a bet on that future. The bet itself is motivation, not a
testable property of the design; the commitments below are.

## Design commitments

1. **Prose membrane, strict core.** Specs are authored and consumed as
   prose; the stored form is a strict schema. An LLM interview is the
   *ergonomic* authoring path, never the only one: a human (or any tool) may
   write the interchange format directly and validate with `lint`. Nothing
   in conformance depends on any model, vendor, or agent framework.
2. **A spec is a standing contract.** Implementations drift; the spec is
   what they drift from; the verifier measures it. The spec is never
   discarded scaffolding.
3. **Conformance is derived from recorded evidence, never asserted bare.**
   "Done" means the gating criteria have passing verification records.
   Overrides exist, but only as *waivers* — recorded, justified, expiring,
   and loud in every report (see Conformance model).
4. **The toolchain is specced in felag, by conformance class.** A stranger
   can reimplement any class (interchange reader/writer, verifier, author)
   in any language and verify the mechanical classes against the felag spec
   of felag. Author-class conformance is partially judgment-verified and is
   labeled as such.

## The three strata

The substitution test: *we ship a TypeScript/shadcn rendering; a stranger
ships a Rust TUI. Both must satisfy the spec — and where declared,
interoperate (the word-processor case: each must open the other's
documents).*

| Stratum | Test | Lives |
|---|---|---|
| **Behavioral core** | Declared contractual, and two well-meaning implementations could observably diverge on it | the spec |
| **Implementation profile** | Not load-bearing for strangers; *we* want it consistently our way | a profile artifact alongside one implementation |
| **Residue** | Nobody could get it wrong | code, commits, nowhere special |

**Scope is closed-world.** The preamble declares what is contractual;
**anything not declared is non-core by default.** Observability alone never
makes something core — error-message wording, log formats, latency, and
pagination order are all observable and all residue *unless declared*. This
is the Hyrum's-law guard: the preamble is the allowlist, not a hint.

Worked exclusion example: a task-manager spec declares `contract: task
interchange format` and is silent on CLI output. A criterion proposing exact
CLI table formatting fails `lint`: observable, divergeable, **not within a
declared contract** → profile or residue.

**Preamble schema** (normative part of the interchange format):

```
preamble:
  name, conformanceVersion
  goals: [prose]
  contracts: [ { id, description } ]
  exclusions: [prose]        # optional, documentation of deliberate non-contracts
  implementers: [ { name, role(s) } ]   # governance roster; may be one entry
```

(v1.1: contracts no longer carry a `fixtures: required|optional` knob — it
existed only to weaken the interop proof. The fixture rule lives on the
criterion, below.)

The **profile** is a separate artifact (not a child of the Spec — it ships
with one implementation, not with the contract): a declared set of standing
implementation choices (stack, deployment, style) that a team applies to its
rendering. Adopters discard ours and substitute theirs. felag owns the
profile *format* only.

**Promotion and demotion.** An implementation-time discovery promotes to
core (passes the stranger test within declared scope), to profile (a
standing preference), or remains residue. Every criterion carries
`source: forethought | discovered` with attribution. The inverse paths exist
and mirror the same provenance:

- `proposed` — exists in committed interchange (diffable, reviewable,
  mergeable) but not yet ratified; **never gates**. This is excavate's
  output state; ratification moves it to `active`, rejection deletes it
  (history lives in git), known-bug records the divergence as a
  `kind: known-bug` waiver in the implementation's ledger.
- `deprecated` — criterion retired from gating (kept for history, excluded
  from conformance), with reason + attribution.
- `disputed` — an implementer formally contests the criterion or its
  verification. A disputed criterion reports loudly everywhere, but it
  **stops gating only for the disputing implementer's** conformance reports;
  it continues to gate everyone else. Resolution requires acknowledgment
  from all roster implementers **except the disputer** (solo roster or
  deadlock → repo-owner tiebreak). Dispute is an objection channel, not a
  cheaper deprecation: removing a MUST for everyone remains a MAJOR
  governance act.

Attribution fields (`discoveredBy`, verdict provenance, waiver authors) are
**free-form attribution strings with no semantics**. felag defines no
identity model; an ephemeral CI job may write `"ci@github-actions
run:12345"`. Implementers MUST NOT build behavior on these values.

## Data model (v1)

```
Spec  (committed interchange: line-oriented JSONL + JSON Schema)
├── preamble (schema above)
├── sections[] → SpecItem { id, title, body, interfaceSketch? }
│     └── acceptanceCriteria[] → AcceptanceCriterion
│           ├── id                              # stable; coverage and idempotency key
│           ├── contractId?                     # membership in a declared contract; GATING REQUIRES THIS
│           ├── type: scenario | checklist
│           ├── class: behavioral | judgment     # gating vs advisory (see Conformance)
│           ├── gherkin | item                   # Gherkin scenario or EARS sentence
│           ├── force: MUST | SHOULD | MAY
│           ├── state: proposed | active | deprecated | disputed   # proposed never gates
│           ├── source: forethought | discovered (+ discoveredAt/By/triggeringEvent)
│           ├── fixtures: [fixtureRef]           # MUST be non-empty when contractId set AND class=behavioral
│           └── judgment?: { rubric, judgeConfig, reproducibility }   # required if class=judgment gating is ever requested
│
├── fixtures[] → Fixture                         # first-class, canonical interop corpus
│     { id, contractId, description, input, expected, format }
│
└── (separate artifacts, referenced not embedded)
    Profile          — per-implementation standing choices
    Binding          — per-implementation glue manifest: maps scenario steps /
                       fixtures onto that implementation's interfaces; names the
                       runner; declares which criteria it can execute
    VerificationRecord — see Conformance model
```

`signature` (v0) is renamed **`interfaceSketch?`**: an optional,
non-normative illustration of an interface shape for human readers. It never
gates and carries no conformance meaning; if an interface is contractual,
express it as criteria + fixtures.

**Canonical serialization is a conformance requirement** of the interchange
class: conforming writers MUST emit canonical form — one record per line,
pinned key order, pinned escaping, stable record ordering — so that git
diff/blame/merge and fixture hashing are well-defined across tools. (The
precise canonicalization rules are written during compilation; the
*requirement* is normative now.)

**Fixtures are the interop proof.** Gherkin/EARS sentences carry human
intent; **canonical fixtures carry the contract**. Any **behavioral**
criterion with a `contractId` MUST reference at least one fixture (concrete
input → expected output); `lint` enforces this mechanically. **Judgment
criteria are exempt from the fixture rule and never gate** — contract
interop is proven on behavioral criteria only. Two implementations interoperate when both pass the shared
fixture corpus — not when both teams privately bound the same English to
their own interfaces. Bindings are named per-implementation artifacts
precisely because binding is where ambiguity lives; fixtures are how we stop
ambiguity from mattering.

Checklist (EARS) criteria are rarely mechanically verifiable; expect them to
be `judgment`-class (advisory) or to earn fixtures. The authoring protocol
prefers fixtures for anything contractual and carries **scenario budgets** —
explicit caps and granularity rules in the interview protocol (criteria per
item, scenarios per criterion) so authoring generates few high-value
criteria, not Cucumber-style sprawl.

## Storage and authority

**The committed JSONL interchange files are the source of truth.** They are
line-oriented: git diff, blame, PR review, and three-way merge genuinely
work; a reviewer's suggestion on a rendered markdown line round-trips via a
delta-edit (`author --from-annotations`) into interchange lines. Renders
(markdown, per audience) are regenerated artifacts committed for reading.

**Dolt (or any database) is a local, regenerable index** — an accelerator
for query/history UX, never authoritative, never committed. Rebuilding it
from the interchange files is a conformance requirement of the interchange
class. (v0 had this inverted; the cold review was right that a binary DB in
git rides none of git's rails.)

Merge semantics are git's, with `lint` as the merge gate: structural
validity, unique criterion ids, version-bump consistency (two branches both
bumping the version is surfaced by lint, resolved by governance rules below).

## Conformance model

**Conformance classes** (a reimplementation declares which it targets):

- `felag/interchange` — reads and writes the interchange format,
  round-trips losslessly, rebuilds indexes. Fully mechanical.
- `felag/verifier` — ingests verification results, derives conformance
  state, produces reports. Fully mechanical.
- `felag/author` — implements the interview and render protocols. Partially
  judgment-verified; its conformance reports say so on their face.

**Verb → conformance class** (the classes are the compiled spec's
contracts; a reimplementer targets classes, not the whole surface):

| Class | Verbs | Also validates |
|---|---|---|
| `felag/interchange` | `lint` | the interchange format itself, Profile and Binding artifact formats, canonical serialization, index rebuild |
| `felag/verifier` | `verify`, `audit` | VerificationRecord ingestion, waivers, reports, coverage |
| `felag/author` | `author`, `excavate`, `render`, `prime` | interview/render protocols (partially judgment-verified) |

**`verify` is a ledger, not a runner.** felag never executes
implementations, spawns agents, or manages sessions — that refusal is real
and this is how: checks are run *outside* felag (CI, an agent, a human, a
goat) by whatever runner the implementation's Binding names. The runner
submits **VerificationRecords** in a defined result format:

```
VerificationRecord {
  criterionId, fixtureId?, fixtureHash?,        # hash over canonical fixture serialization
  implementation, implementationVersion,
  conformanceVersion,
  verdict: pass | fail | unverifiable,
  evidence (free-form, e.g. runner output ref),
  runner, at, attribution-string
}
```

Records are **self-reported**; their check is reproducibility against the
public fixture corpus, not identity — felag defines no trust hierarchy.
"Never asserted bare" (commitment 3) means *evidence-carrying and
re-runnable*, not *third-party-certified*.

`verify` validates records, derives per-criterion conformance, and reports:
"implementation X conforms to 1.2; drifts from 1.3 at criteria a, b;
2 waivers active; 1 criterion disputed."

**Gating:** a criterion gates conformance only if **all** hold:
`class: behavioral`, `state: active`, force `MUST`, **and `contractId` set
to a contract declared in the preamble**. Gate ⊆ allowlist — this is what
makes closed-world scope mechanical: a criterion about an undeclared surface
cannot gate no matter how it's written, and `lint` enforces it structurally
(gating criterion ⇒ contractId present ∧ declared ⇒ fixtures non-empty).
Criteria without a contractId may exist as advisory documentation. **`judgment` criteria are advisory in v1** —
they appear in reports, never in the conformance verdict. A judgment
criterion may *graduate* to gating only when its `judgment` block pins
rubric + judge configuration + a reproducibility statement, and the felag
spec defines the reproducibility bar (same rubric + same pinned judge ⇒
same verdict, within a declared tolerance). Until that bar exists and is
met, no spec may define "done" through a judgment criterion. (This is the
v0 Art-shaped hole, closed: nothing in gating depends on any particular
cognition stack.)

**Waivers** (the override that every system reinvents — designed in, not
smuggled in): `{ criterionId, implementation, kind: waiver | known-bug,
justification, attribution, expiresAt }`, stored in the implementation's
ledger (waivers are per-implementation by construction). A waived failing
criterion does not block conformance but changes the verdict token: such an
implementation reports **`conforms-with-waivers`**, never bare `conforms` —
the headline cannot be laundered by truncating the report. Expired waivers
are failures again. `kind: known-bug` is the home for excavate's tracked
divergences: a standing, acknowledged delta between current behavior and the
ratified spec.

**Verification records live with implementations, not in the spec repo.**
The spec repo commits the contract; each implementation (or its CI) owns its
ledger and may publish reports. Three collaborators with three work layers
and two implementations never contend on shared verification state.

**Incremental verification:** records key on (criterionId, fixture set hash,
implementation version); unchanged keys need no re-run. Judgment re-runs are
triggered by rubric/judge-config changes, not by the calendar.

## Versioning and governance

- **Additive MUST criterion = MAJOR.** It breaks every conforming
  implementation by definition. (v0 called this minor; that was wrong.)
- **Modifying an existing fixture's `input` or `expected` = MAJOR; removing
  a fixture = MAJOR.** Fixtures carry the contract — editing one is a
  behavior change wearing a test's clothes. Fixture description/metadata
  edits = PATCH.
- **Graduating a judgment criterion to gating = MAJOR** (it is an additive
  MUST in effect).
- Additive SHOULD/MAY, *new* fixtures for existing criteria = MINOR.
- Clarifications, prose, renders = PATCH.
- Deprecating a MUST = MAJOR; deprecating SHOULD/MAY = MINOR.

**Governance (minimum viable):** spec changes merge via the same review
mechanics as code. The preamble's `implementers` roster is the governance
body: **promotion to core and MAJOR bumps require acknowledgment from all
roster implementers; dispute resolution requires all roster implementers
except the disputer** (a roster of one — the solo case — degenerates to
repo-owner authority, explicitly; deadlocks tiebreak to the repo owner).
`disputed` is the formal objection channel, scoped per the criterion-state
rules above so it is never a cheaper deprecation. Errata (PATCH) need only
ordinary review.

**Liveness:** acknowledgments lapse — a roster implementer silent past the
roster's declared timeout (default 30 days) does not veto; their
acknowledgment records as lapsed and the change proceeds. Roster membership
is maintained by ordinary spec PR, so an absent implementer can be removed
the same way. One abandoned implementer never freezes the contract.

This section is deliberately small; it exists so that silence doesn't default
to "whoever holds the repo" while the project claims to be a communal
contract.

## Tool surface (v1)

A library; MCP server and CLI are thin parallel shells. **`prime` emits
vendor-neutral markdown** (the authoring/interview/promotion protocols);
packaging that guidance into any harness's native format (skills, system
prompts, whatever a vendor calls them) is an adapter beyond the seam.

| Verb | Contract |
|---|---|
| `author` | Prose→schema compilation. Interview flows: greenfield, delta (update), and **`--from-annotations`** (ingest an annotated render — the stakeholder round-trip; the edited render never becomes a second source of truth). Interview script front-loads: "contract or choice? could a stranger get it wrong? which fixture proves it?" Carries scenario budgets. **The no-LLM path is normative:** hand-write interchange lines, run `lint`. |
| `excavate` | Brownfield: propose a spec from a repo's current behavior, **bounded by a required scoping input** (which surfaces/contracts to mirror). Output criteria are `source: discovered` in triage state `proposed`; ratification is explicit: `proposed → ratified | rejected | known-bug`. Bugs become tracked divergences, never MUSTs. The honest onboarding wedge is this verb on the adopter's own repo. |
| `verify` | The ledger: validate + ingest VerificationRecords, derive conformance, report (incl. waivers, disputes, version drift). Never executes anything. |
| `audit` | Coverage: criteria lacking passing records, items lacking tasks. Emits task proposals across the felag-tasks contract, **idempotent on (specItemRef, criterionId)** — re-running audit never duplicates proposals. With no work layer attached, proposals emit as a report artifact (stdout/file) instead. |
| `render` | Audience projections from the single source of truth: stakeholder (criteria-only, observable language), developer (+ contracts, fixtures, profile), verifier (raw schema). Renders are one-way artifacts; edits return via `author --from-annotations`. |
| `lint` | Schema + structure + scope enforcement: criteria typed and forced, fixtures present under contracts, closed-world scope respected, version-bump consistency, unique ids. The merge gate. |
| `prime` | Emit the protocols, vendor-neutral. |

## felag-tasks — the work layer as a contract

Unchanged in architecture from v0, tightened at the seams:

- felag-core refuses work state (no work tables in core storage, no work
  verbs in the core verb set); core operates with any conforming work layer
  **including none**.
- The felag-tasks contract is MUST-minimal: accept proposals (carrying
  specItemRef + criterionId), expose status, report linkage. A thin shim
  over an existing system (beads, Linear, a GTD relic) can conform without
  reimplementation.
- A bundled reference implementation ships as a **sibling conformance
  unit** with its own spec.
- **Work-layer binding is personal** (workstation config, never committed);
  `specItemRef` is the cross-layer identity that makes two people's layers
  provably reference the same unit of work.
- Cross-person claim visibility is **out of scope**. (v0 floated it as
  "optional federation"; the cold review correctly identified that as the
  first junk-drawer feature. Removed, not deferred.)

## Seams

felag owns: the interchange format and its validation; fixtures; the
conformance ledger and reporting; the interview/render/promotion protocols
(vendor-neutral); the profile and binding *formats*.

felag refuses: execution (ledger, not runner); work state (felag-tasks
contract, sibling unit); identity (attribution strings, no semantics);
memory and preference *content* (profiles are written by people/agents from
whatever they use — a preference store, a wiki, taste).

Adopters assemble: repo (spec + code + fixtures — world-facing), work layer
(personal), cognition layer (whatever wields the tools). felag is the only
mandatory piece for a stranger, and the least interesting one to own.

## Open questions (v1)

1. Judgment graduation bar: the concrete reproducibility tolerance and
   pinned-judge format (schema fields exist; the bar needs numbers). The bar
   must also make the judge itself **substitutable** — a pinned vendor model
   would smuggle vendor-dependence back into conformance (violating
   commitment 1). Likely shape: the judge is specified by a calibration
   corpus (rubric + calibration set any candidate judge must pass to
   qualify), so "same pinned judge" means "any judge passing calibration,"
   not "this vendor's model."
2. Fixture format for non-deterministic surfaces (timestamps, generated
   ids) — canonicalization rules.
3. felag-tasks contract: the exact MUST set (next artifact to draft).
4. Multi-spec repos: namespace layout under the interchange directory.
5. Spec-to-spec dependencies (composition) — deferred past v0.

## Cold-review disposition (v0 → v1)

| Finding | Disposition |
|---|---|
| C1 judgment verification coupled to the authors' private cognition stack | **Accepted.** Judgment = advisory; gating is behavioral-only; graduation requires pinned rubric/judge + reproducibility bar. |
| C2 binding/glue absent | **Accepted.** Binding = named artifact; canonical fixtures = first-class and required under contracts; interop proven on shared corpus. |
| C3 verify vs execution refusal | **Accepted.** `verify` is a ledger; VerificationRecord format defined; runners are external. |
| C4 Dolt-in-git authority | **Accepted.** Authority inverted: committed JSONL is truth; Dolt is a regenerable local index. |
| H1 scope over-capture | **Accepted.** Closed-world scope; preamble schema; worked exclusion example. |
| H2 versioning + governance | **Accepted.** Additive MUST = MAJOR; implementer-roster governance with explicit solo degenerate case. |
| H3 LLM/vendor leaks | **Accepted.** No-LLM authoring path normative; prime vendor-neutral; estate jargon removed. |
| H4 conformance classes | **Accepted.** interchange / verifier / author classes; author labeled partially judgment-verified. |
| H5 no demotion/waiver | **Accepted.** deprecated/disputed states; waivers with justification + expiry, loud in reports. |
| M1 audit idempotency; federation creep | **Accepted.** Idempotency on (specItemRef, criterionId); federation removed as out of scope. |
| M2 shared conformance state | **Accepted.** Verification records live with implementations; spec repo carries the contract only. |
| M3 excavate triage | **Accepted.** Required scoping input; proposed → ratified/rejected/known-bug. |
| M4 diagram contradiction | **Accepted.** Profile/Binding shown as separate referenced artifacts. |
| M5 identity-shaped fields | **Accepted.** Attribution strings, no semantics, normatively stated. |
| M6 EARS verifiability | **Accepted.** Expect judgment-lopsidedness; authoring prefers fixtures for contracts. |
| PM round-trip / onboarding / economics | **Accepted.** `author --from-annotations`; excavate as the wedge; incremental verification keyed on content hashes. |
| Thesis 1 unfalsifiable | **Accepted.** Moved to Motivation, unnumbered. |

## Second cold review disposition (v1 → v1.1, same file)

All seven must-fix findings applied in place; verdict was "architecture
survives; the schemas don't yet."

| Finding | Disposition |
|---|---|
| CR2-C1 no criterion↔contract linkage | **Accepted.** `contractId?` on criteria; gating requires declared-contract membership (gate ⊆ allowlist); lint rule now mechanical. |
| CR2-C2 preamble `fixtures: optional` vs fixture MUST | **Accepted.** Enum dropped; fixture MUST scoped to behavioral criteria with contractId; judgment criteria exempt and never gate. |
| CR2-C3 dispute = free unilateral un-gating | **Accepted.** Resolution excludes disputer; dispute un-gates only the disputer's reports; liveness timeout + roster maintenance; deadlock → repo owner. |
| CR2-H4 `proposed` state + divergence home | **Accepted.** State enum extended; known-bug = waiver kind in the implementation ledger. |
| CR2-H5 record lacks incremental keys | **Accepted.** `fixtureHash` + `implementationVersion` added. |
| CR2-H6 fixture modification unversioned | **Accepted.** Fixture input/expected edit or removal = MAJOR; metadata = PATCH; graduation = MAJOR. |
| CR2-M7 verb→class mapping | **Accepted.** Table added; interchange class validates Profile/Binding formats. |
| CR2-M8 canonical serialization | **Accepted as requirement**; rules derived during compilation. |
| CR2-M9 pinned judge = vendor trapdoor | **Accepted into open question 1**: judge substitutability via calibration corpus. |
| CR2-M10/L11/L12/L14/L15 | **Accepted.** Self-reported trust model stated; waiver scope/storage + `conforms-with-waivers` token; `interfaceSketch` named non-normative; audit-without-work-layer emits a report. |
