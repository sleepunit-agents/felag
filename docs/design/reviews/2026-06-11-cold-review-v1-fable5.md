# felag v1 — second-round cold review

Verdict up front: **the architecture survives; the schemas don't yet.** The seven big fixes are individually sound and mutually compatible at the design level, but four of them fail at the field level — the document makes normative claims its own schemas can't represent. None of these are re-litigations; they're holes *inside* the fixes. Fix the schema-level items (a day of editing, not a redesign) before compiling, because compilation will hit every one of them in the first hour.

---

## 1. Cross-check of the fixes

### CRITICAL-1: Closed-world scope is structurally unenforceable — criteria have no contract linkage

The closed-world fix and the gating rule don't connect.

> "A criterion proposing exact CLI table formatting fails `lint`: observable, divergeable, **not within a declared contract**"

But look at the criterion schema: `id, type, class, gherkin|item, force, state, source, fixtures, judgment?`. **There is no `contractId` field on AcceptanceCriterion.** Contract membership is only derivable transitively through fixtures (which carry `contractId`) — and fixtures are only required for criteria "under a contract." Meanwhile the gating rule is:

> "only `class: behavioral`, `state: active`, force `MUST` criteria gate conformance"

— with no contract requirement. So a spec whose preamble declares only `task interchange format` can still contain a gating behavioral MUST about CLI table formatting, with no fixtures, and **lint has no structural basis to reject it.** The worked exclusion example claims lint catches it; mechanically, lint cannot — "is this criterion about a declared contract" is a semantic judgment unless the linkage is a schema field. The closed-world fix (H1) is currently a preamble-level promise with no criterion-level teeth, which is exactly the failure mode H1 was meant to close.

**Fix:** add `contractId?` to AcceptanceCriterion, and make the rule: *a criterion gates only if it belongs to a declared contract* (gate ⊆ allowlist). Then lint's job is mechanical: gating criterion ⇒ contractId present and in the preamble ⇒ fixtures present. This also makes the worked example true. Criteria outside any contract may exist but are advisory — which is what "anything not declared is non-core" should have meant all along.

### CRITICAL-2: The preamble contradicts the fixture MUST

> Preamble: `contracts: [ { id, description, fixtures: required|optional } ]`

> Data model: "Any criterion under a declared contract **MUST** reference at least one fixture"

These cannot both be normative. Either `fixtures: optional` is legal — in which case the MUST is false and "fixtures are the interop proof" has an escape hatch big enough to drive v0's C2 problem back through — or the MUST holds and the `optional` enum value is dead schema. The first lint implementation must pick one.

Adjacent hole, same lint rule: **judgment-class criteria under a contract can't satisfy the fixture MUST** — a fixture is "concrete input → expected output," which is precisely what a judgment criterion lacks. Either judgment criteria are barred from contracts, or they're exempt from the fixture rule; the document says neither.

**Fix:** drop `optional` (recommended — it exists only to weaken the interop proof), or scope the MUST to `fixtures: required` contracts and say what `optional` buys. State explicitly: judgment-class criteria are exempt from the fixture requirement and never gate, so contract interop is proven on behavioral criteria only.

### CRITICAL-3: Dispute + unanimous governance = a unilateral, free, permanent un-gating tool

Three sentences interact badly:

> "disputed criteria report loudly and **do not gate until resolved by governance**"

> "promotion to core, MAJOR bumps, and **dispute resolution require acknowledgment from all roster implementers**"

> "Deprecating a MUST = MAJOR"

The disputer is on the roster. Resolution requires the disputer's acknowledgment. So any single implementer can mark any MUST `disputed` — instantly removing it from gating — and then simply never acknowledge a resolution. The result: dispute achieves the full effect of deprecating a MUST (a MAJOR event requiring unanimous consent) at **zero version cost and zero agreement, irreversibly**. The formal objection channel is strictly more powerful than the formal change process. Separately, there is no liveness rule: one implementer abandoning the project blocks every MAJOR bump forever.

**Fix:** (a) dispute resolution requires acknowledgment from all roster members *except* the disputer, or repo-owner tiebreak in the solo/deadlock case; (b) consider having a disputed criterion continue gating for non-disputing implementers (the dispute suspends it only for the disputer's conformance reports); (c) add an acknowledgment timeout or roster-removal rule so an absent implementer's silence lapses rather than vetoes. The governance paragraph is "deliberately small," fine — but it must not be deliberately small *and* contain a deadlock.

### HIGH-4: Excavate's lifecycle states don't exist in the data model

> `excavate`: "Output criteria are `source: discovered` in **triage state `proposed`**; ratification is explicit: `proposed → ratified | rejected | known-bug`"

> Criterion schema: `state: active | deprecated | disputed`

`proposed` is not in the enum. A proposed-but-unratified criterion must be representable in committed interchange (otherwise excavate's output can't be diffed, reviewed, or merged — the whole point of the JSONL-authority fix), and it must be excluded from gating. Right now it can't be written down at all. Also:

> "Bugs become **tracked divergences**, never MUSTs"

Tracked *where*? No divergence artifact exists in the data model, the spec repo, or the implementation ledger. M3's fix names a destination that doesn't exist.

**Fix:** extend the enum (`proposed | active | deprecated | disputed`; `rejected` = deleted with history, or a terminal state), define proposed as never-gating, and give known-bug divergences a home — the natural one is the implementation's ledger (a standing fail-with-acknowledgment record), or a waiver with `known-bug` flavor. Pick one and write it.

### HIGH-5: Incremental verification keys on fields the VerificationRecord doesn't carry

> "records key on (**criterionId, fixture set hash, implementation version**)"

> `VerificationRecord { criterionId, fixtureId?, implementation, conformanceVersion, verdict, evidence, runner, at, attribution-string }`

There is no fixture-set-hash field and no implementation-version field (`implementation` is a name; `conformanceVersion` is the *spec* version targeted). A stateless CI runner — the headline consumer of incremental verification — cannot compute "unchanged keys need no re-run" from records as schematized. Who computes the fixture hash, over what serialization, and where is it stored? Unanswered, and the record format is one of the things being compiled.

**Fix:** add `fixtureHash` and `implementationVersion` to the record, and define the hash as over the canonical fixture serialization (see MEDIUM-8 — these two holes share a root).

### HIGH-6: Versioning is silent on fixture *modification*

> "Additive SHOULD/MAY, **new fixtures** for existing criteria = MINOR."

Editing an existing fixture's `expected` output changes the contract as hard as an additive MUST — every implementation that passed it may now fail — and removing a fixture weakens the interop proof. Neither has a version classification. Since fixtures, not sentences, "carry the contract" (the document's own words), this is the single most consequential versioning case and it's the one missing from the table.

**Fix:** fixture `expected`/`input` modification under an existing criterion = MAJOR (it's a behavior change wearing a test's clothes); fixture removal = MAJOR; description/format-metadata edits = PATCH.

### MEDIUM-7: The verb→conformance-class mapping is incomplete

> Commitment 4: "The toolchain is specced in felag, **by conformance class**."

Classes cover: interchange (read/write/round-trip/rebuild), verifier (`verify`), author ("the interview and render protocols"). Seven verbs exist. Where do `lint`, `excavate`, `audit`, and `prime` live? A stranger reimplementing `felag/verifier` doesn't know whether `audit` is in scope; `excavate` is heavily judgment-shaped and belongs in the partially-judgment-verified author class, but nothing says so. Commitment 4 is the spine of the self-hosting plan and it can't be compiled without this mapping — the classes *are* the compiled spec's contracts.

**Fix:** one table: verb → class. Plausibly: lint → interchange; audit → verifier; excavate, prime → author. Also state which class validates Profile and Binding artifacts (felag "owns the formats" but no class claims them — presumably interchange).

### MEDIUM-8: The "git rails" claim assumes canonical serialization that is never required

> "line-oriented: git diff, blame, PR review, and three-way merge **genuinely work**"

Only if every conforming writer emits byte-identical lines for identical records: pinned key order, pinned escaping, one record per line, stable ordering of records. Round-trip losslessness (required) does not imply canonical output (not required) — two interchange-class tools can both round-trip losslessly while shredding each other's diffs. This also underpins HIGH-5's fixture hash. Discoverable during compilation, but the *requirement* (interchange class MUST emit canonical form; define it) should be stated now because the storage-authority fix's justification depends on it.

### MEDIUM-9: Judgment graduation, as designed, will violate commitment 1

> Commitment 1: "Nothing in conformance depends on any model, vendor, or agent framework."

> Graduation: "same rubric + **same pinned judge** ⇒ same verdict"

A pinned judge is, in practice, a pinned model from a pinned vendor. The day the first judgment criterion graduates to gating, conformance depends on a vendor — the exact C1 disease, deferred rather than cured. This is post-v1 and need not block compilation, but the open question 1 should be amended to include: *what makes a pinned judge itself substitutable* (e.g., the judge is specified by its own fixture corpus — rubric + calibration set that any judge must pass to qualify). Otherwise graduation is a trapdoor back into the Art-shaped hole.

### Lower-severity findings

- **MEDIUM-10 — trust model unstated.** Commitment 3 says conformance is "never asserted bare," but records carry free-form attribution, free-form evidence, no identity (M5, settled). A self-published ledger is a bare assertion with better paperwork. That's *fine* — self-certification against a reproducible public fixture corpus is how most standards work — but say it: "records are self-reported; their check is reproducibility, not identity." Don't let commitment 3 imply a guarantee M5 deliberately removed.
- **LOW-11 — waiver schema has no scope.** `{ criterionId, justification, attribution, expiresAt }` — no `implementation` field and no stated storage location. Presumably waivers live in the implementation's ledger (making implementation implicit); one sentence fixes it.
- **LOW-12 — "conforms with 47 waivers" still reads "conforms."** Since waivers are self-granted (no identity), consider a distinct verdict token (`conforms-with-waivers`) so the headline can't be laundered by truncating the report. Loudness-in-prose is weaker than the rest of the design.
- **LOW-13 — graduation's version impact unstated.** Graduating a judgment criterion to gating is an additive MUST in effect → should be MAJOR. One line.
- **LOW-14 — `signature?` on SpecItem is unexplained.** API signature? Cryptographic? A stranger can't tell. Name it or cut it.
- **LOW-15 — `audit` with no work layer.** Core "operates with any conforming work layer including none," but audit "emits task proposals across the felag-tasks contract." With none, proposals go where? (Presumably a report artifact.) One sentence.

## 2. Stranger test, round two

Substantially passed. Concretely:

- **Stateless CI job:** can author (hand-write JSONL + `lint` — explicitly normative), verify (external runner → VerificationRecords; the `"ci@github-actions run:12345"` example shows the authors thought about exactly this), and adopt the interchange. The one stumble is HIGH-5: incremental verification, the feature aimed *at* CI, can't be computed from the record schema as written.
- **No-agent human:** the hand path is genuinely normative, fixtures are mechanical, waivers/disputes are file edits. Passes — except they can't know what reimplementing a class obligates (MEDIUM-7).
- **Different vendor's agent:** `prime` emits vendor-neutral markdown; judgment is advisory so no judge pinning binds anyone yet. Passes, with MEDIUM-9 as the time bomb.

Residual private context, all trivial: **"loom"** in the disposition table (C1) is a v0 codename a stranger can't resolve — exactly the H3 jargon class, ironically surviving inside the row that records H3's fix. "Beads" as a work-layer example, "scenario budgets" as a named-but-undefined protocol knob, and `signature?` (LOW-14) round out the list. Nothing structural hides a persistent agent or a vendor anymore — C3/C4/H3 held up.

## 3. Readiness verdict

**Not ready to compile yet — but close, and the blockers are edits, not redesigns.**

**Must fix before compiling** (compilation requires writing these very schemas and lint rules, so each becomes a contradiction in the spec's own interchange file on day one):

1. CRITICAL-1 — criterion↔contract linkage + "gating requires contract membership" (makes closed-world and the lint example true)
2. CRITICAL-2 — resolve `fixtures: required|optional` vs the fixture MUST; carve out judgment criteria
3. CRITICAL-3 — dispute-resolution rule that excludes the disputer; a liveness rule for the roster
4. HIGH-4 — `proposed` in the state enum; a home for tracked divergences
5. HIGH-5 — `fixtureHash` + `implementationVersion` on VerificationRecord
6. HIGH-6 — fixture-modification = MAJOR (one row in the version table)
7. MEDIUM-7 — verb→class table, plus who validates Profile/Binding

**Can be discovered during compilation:** canonical JSONL serialization details (MEDIUM-8 — state the requirement now, derive the rules then), the trust-model sentence (MEDIUM-10), waiver scope/storage (LOW-11), waiver verdict token (LOW-12), graduation versioning and judge-substitutability (MEDIUM-9, LOW-13 — post-v1 anyway), `signature?`, audit-without-work-layer, and the open questions already listed.

The pattern across everything above: v1's prose-level decisions are coherent with each other; every defect found is a place where a prose commitment didn't get propagated into a schema field, an enum value, or a lint rule. That's the right kind of broken for a document about to be compiled — compilation is precisely the process that punishes it. Do the seven edits first so the first `lint` run of felag-on-felag fails on real findings instead of on the spec contradicting itself.
