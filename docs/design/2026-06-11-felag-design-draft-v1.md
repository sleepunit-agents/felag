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
  contracts: [ { id, description, fixtures: required|optional } ]
  exclusions: [prose]        # optional, documentation of deliberate non-contracts
  implementers: [ { name, role(s) } ]   # governance roster; may be one entry
```

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

- `deprecated` — criterion retired from gating (kept for history, excluded
  from conformance), with reason + attribution.
- `disputed` — an implementer formally contests the criterion or its
  verification; disputed criteria report loudly and do not gate until
  resolved by governance.

Attribution fields (`discoveredBy`, verdict provenance, waiver authors) are
**free-form attribution strings with no semantics**. felag defines no
identity model; an ephemeral CI job may write `"ci@github-actions
run:12345"`. Implementers MUST NOT build behavior on these values.

## Data model (v1)

```
Spec  (committed interchange: line-oriented JSONL + JSON Schema)
├── preamble (schema above)
├── sections[] → SpecItem { id, title, body, signature? }
│     └── acceptanceCriteria[] → AcceptanceCriterion
│           ├── id                              # stable; coverage and idempotency key
│           ├── type: scenario | checklist
│           ├── class: behavioral | judgment     # gating vs advisory (see Conformance)
│           ├── gherkin | item                   # Gherkin scenario or EARS sentence
│           ├── force: MUST | SHOULD | MAY
│           ├── state: active | deprecated | disputed
│           ├── source: forethought | discovered (+ discoveredAt/By/triggeringEvent)
│           ├── fixtures: [fixtureRef]           # required for criteria under a contract
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

**Fixtures are the interop proof.** Gherkin/EARS sentences carry human
intent; **canonical fixtures carry the contract**. Any criterion under a
declared contract MUST reference at least one fixture (concrete input →
expected output). Two implementations interoperate when both pass the shared
fixture corpus — not when both teams privately bound the same English to
their own interfaces. Bindings are named per-implementation artifacts
precisely because binding is where ambiguity lives; fixtures are how we stop
ambiguity from mattering.

Checklist (EARS) criteria are rarely mechanically verifiable; expect them to
be `judgment`-class (advisory) or to earn fixtures. The authoring protocol
prefers fixtures for anything contractual and carries **scenario budgets**:
granularity guidance so the interview generates few high-value criteria, not
Cucumber-style sprawl.

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

**`verify` is a ledger, not a runner.** felag never executes
implementations, spawns agents, or manages sessions — that refusal is real
and this is how: checks are run *outside* felag (CI, an agent, a human, a
goat) by whatever runner the implementation's Binding names. The runner
submits **VerificationRecords** in a defined result format:

```
VerificationRecord {
  criterionId, fixtureId?, implementation, conformanceVersion,
  verdict: pass | fail | unverifiable,
  evidence (free-form, e.g. runner output ref),
  runner, at, attribution-string
}
```

`verify` validates records, derives per-criterion conformance, and reports:
"implementation X conforms to 1.2; drifts from 1.3 at criteria a, b;
2 waivers active; 1 criterion disputed."

**Gating:** only `class: behavioral`, `state: active`, force `MUST`
criteria gate conformance. **`judgment` criteria are advisory in v1** —
they appear in reports, never in the conformance verdict. A judgment
criterion may *graduate* to gating only when its `judgment` block pins
rubric + judge configuration + a reproducibility statement, and the felag
spec defines the reproducibility bar (same rubric + same pinned judge ⇒
same verdict, within a declared tolerance). Until that bar exists and is
met, no spec may define "done" through a judgment criterion. (This is the
v0 Art-shaped hole, closed: nothing in gating depends on any particular
cognition stack.)

**Waivers** (the override that every system reinvents — designed in, not
smuggled in): `{ criterionId, justification, attribution, expiresAt }`.
A waived failing criterion does not block conformance but appears in every
report, first, until it expires. Expired waivers are failures again.

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
- Additive SHOULD/MAY, new fixtures for existing criteria = MINOR.
- Clarifications, prose, renders = PATCH.
- Deprecating a MUST = MAJOR; deprecating SHOULD/MAY = MINOR.

**Governance (minimum viable):** spec changes merge via the same review
mechanics as code. The preamble's `implementers` roster is the governance
body: **promotion to core, MAJOR bumps, and dispute resolution require
acknowledgment from all roster implementers** (a roster of one — the solo
case — degenerates to repo-owner authority, explicitly). `disputed` is the
formal objection channel. Errata (PATCH) need only ordinary review. This
paragraph is deliberately small; it exists so that silence doesn't default
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
| `audit` | Coverage: criteria lacking passing records, items lacking tasks. Emits task proposals across the felag-tasks contract, **idempotent on (specItemRef, criterionId)** — re-running audit never duplicates proposals. |
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
   pinned-judge format (schema fields exist; the bar needs numbers).
2. Fixture format for non-deterministic surfaces (timestamps, generated
   ids) — canonicalization rules.
3. felag-tasks contract: the exact MUST set (next artifact to draft).
4. Multi-spec repos: namespace layout under the interchange directory.
5. Spec-to-spec dependencies (composition) — deferred past v0.

## Cold-review disposition (v0 → v1)

| Finding | Disposition |
|---|---|
| C1 judgment/loom coupling | **Accepted.** Judgment = advisory; gating is behavioral-only; graduation requires pinned rubric/judge + reproducibility bar. |
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
