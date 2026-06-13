---
name: felag-new
description: "Use when asked to author a new felag spec, start a spec from scratch, run the spec interview, or turn an idea/feature into a felag contract — drives a human-in-the-loop interview that sorts surface into the three strata (contract / profile-binding / excluded), front-loads the stranger test and fixture per criterion, marks ambiguity as [NEEDS CLARIFICATION], and renders the in-progress spec as a show_widget panel. Trigger phrases: /felag new, felag new, author a spec, start a new spec, spec this out, write a felag contract, interview me for a spec."
---

# /felag new

The authoring entry point — where spec quality is born. This is the **hardest**
skill and the only one that is fundamentally a *procedure*, not a render: it
drives an interview that turns an idea into a lint-clean felag spec whose
criteria land `proposed`, ready for `/felag review`.

**HITL by default.** The human is present and confirms every criterion; the
skill *proposes*, the human *disposes*. (Autonomous self-authoring — Art on its
own specs — is the privileged exception, used only when explicitly asked.)

**Resumable.** A half-authored spec is a valid state, persisted to `.felag/`
like any spec. Re-running `/felag new` (or `/felag status`) on it re-opens the
interview where it left off; the open `[NEEDS CLARIFICATION]` cards are the
worklist. Nothing is "done" until the human sends it to review.

## The interview arc

1. **Frame the three strata.** For the thing being specced, sort its surface
   into:
   - **Contract** — observable behavior felag verifies (the law).
   - **Profile / binding** — the builder's free choices (language, transport,
     storage). Recorded as notes, not criteria.
   - **Excluded** — what the spec *loudly refuses* to govern. Also notes.

   Drawing these lines IS the work. Propose a split; let the human correct it.

2. **Per candidate criterion, ask the three front-loaded questions:**
   - **contract-or-choice?** — is this observable law, or a builder's choice?
     (Choices go to profile; refusals go to excluded.)
   - **could-a-stranger-get-it-wrong?** — the clarify test. If a stranger
     implementing only from this sentence could diverge, it is **not a draft
     card** — it is a `[NEEDS CLARIFICATION]`.
   - **which-fixture-proves-it?** — name the fixture before recording.

3. **THE RULE: the round you write the sentence is the round you write the
   fixture.** Refuse to record a criterion without its fixture (or an explicit
   `descriptive` / `excluded` mark). A criterion with no fixture renders amber
   with a `needs fixture` badge — recorded as a draft, but not yet recordable as
   law.

4. **Mark ambiguity, never assume it.** This is the adopted discipline (from
   spec-kit's `[NEEDS CLARIFICATION]`): if a decision isn't settled, it becomes
   an open-question card — never a plausible-but-wrong guess. This is the
   authoring-time twin of felag's runtime rule that conformance is *derived,
   never asserted*: at authoring time, ambiguity is **marked, never assumed.**

5. **Budget.** ≤7 criteria per spec item; flag sprawl rather than waving it
   through.

6. **Emit + gate.** Compile the confirmed criteria via the felag library
   (`serialize` / `sortFixtures`), run `validateAuthorOutput` and `felag lint`.
   Criteria land `proposed`. **Stop there.**

## Hand off — do not auto-chain to review

`/felag new` ends at **proposed + lint-clean** and hands off; it does NOT run
cold review itself. Review is a separate, deliberate step — the **done-signal**.
Riffing on a spec can sprawl across sessions, so nothing is assumed finished
until the human moves it to review. The widget's ready-state offers a single
`felag: cold-review <spec>` button (drafts, human sends) — one click, but a
deliberate one. The proposed→ratified boundary is exactly that governance gate;
auto-chaining would collapse it.

## The arc (render side)

1. **Build the model** as the interview progresses:

   ```js
   {
     spec: "watchdog-core", item: "session-watch",     // optional focus
     contract: [ { id, force, text /* gherkin */, fixture /* id|null */ } ],
     profile:  [ "runtime is the builder's choice", ... ],   // notes
     excluded: [ "no auto-remediation — detection only", ... ],
     clarifications: [ { id, question, criterionId? } ],     // open questions
     lintClean: true,
   }
   ```

2. **Show it.** Pipe through `renderInterviewWidget(model)` and `show_widget`
   the fragment after every meaningful change — the panel is the shared view of
   where the spec stands.

   ```js
   import { renderInterviewWidget } from "<felag>/skills/widget.mjs";
   const fragment = renderInterviewWidget(model);
   // → show_widget with `fragment`
   ```

3. **One-line lead** plus anything needing judgment ("the threshold criterion's
   stranger test is open — I marked it rather than guess wall-clock vs
   active-wait"). Never paste raw records.

## The staging tray — many moves, one governance act

The per-criterion buttons (Confirm / Add fixture / Make descriptive / Exclude)
and the per-question Resolve button **do not send** — they **stage** an intent
into the widget's tray (no `↗`; nothing leaves the widget). The human assembles
a batch — confirm these three, make that descriptive, exclude the other — and
the tray's **Send batch** button fills the input with ONE block:

```
felag: apply these actions to watchdog-core:
1. confirm criterion ac-wd-predicate
2. resolve clarification q-1 (criterion ac-wd-threshold)
```

The human presses enter — the batch is the governance act, reviewed as a block.
The cold-review hand-off stays a *separate single send* (it's terminal, not an
authoring move). The same staging tray powers `/felag review-queue` and
`/felag audit`.

## Snapshot, not a feed

Each rendered panel is frozen at ask-time. Staged actions live only in that
snapshot until sent; after the human sends a batch and you act on it, render a
fresh snapshot showing the new state.
