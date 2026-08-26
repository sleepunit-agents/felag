---
name: felag-review
description: "Cold-review a felag spec to a MERGE / REWORK verdict."
disable-model-invocation: true
---

# /felag review

The cold-review loop, as a skill. A **context-stripped Claude** (no loom, no
global CLAUDE.md, no MCP servers — still on subscription auth) reviews the spec
adversarially. Its ignorance is the method: the stranger finds what insiders
structurally cannot. This skill drives that loop to a `MERGE` verdict, folding
findings between rounds and showing each round as a panel.

This is the quality engine — it has been run by hand dozens of times. The skill
codifies it; it does not need new `src/` code beyond `renderReviewWidget`. It
orchestrates `scripts/cold-review.sh` plus the felag library.

## The loop

1. **Run the cold review.** Build a **fixture-trace prompt** (below) and feed it
   to `scripts/cold-review.sh`, **backgrounded, redirected to an output file**.
   Poll the **output file**, not the process — the reviewer streams to stdout
   and a context-stripped run can take minutes. The watchdog backs the session.
2. **Parse** the verdict (`MERGE` | `REWORK` — some rounds say `REVISE`) and the
   findings, each tagged `CRITICAL` / `MAJOR` / `NIT`.
3. **Show the round** as a widget (below).
   - **REWORK** → surface the findings. Fold each into the spec. *The round you
     write the sentence is the round you write the fixture* — a finding folded
     in is both a prose edit AND its fixture, in the same round (felag's
     prose-decisions-rot-unless-propagated rule). Then **re-run** from step 1.
   - **MERGE** → done. The loop's terminal: nothing left to fold.

## The fixture-trace prompt

The cold reviewer is only as good as what you ask it to do. The prompt that has
found real criticals every round asks the reviewer to:

- **Trace every fixture** named in the spec item bodies back to a concrete,
  checkable artifact — does each fixture actually exist and discriminate?
- **Stranger test** — read the spec as someone who has never seen it. Is every
  MUST/SHOULD enforceable from the text alone, with no insider context?
- **Per-fixture wrong-impl discrimination** — for each fixture, could a plausible
  *wrong* implementation pass it? A fixture that can't fail a wrong impl is not a
  contract.
- **Current fixture count** — state how many fixtures the spec carries now, so
  drift in the count between rounds is visible.

Run it context-stripped against the spec dir under review. The script already
strips context (`--setting-sources project --strict-mcp-config`, empty MCP):

```bash
# Background it; poll the FILE, not the process.
out=$(mktemp)
scripts/cold-review.sh path/to/prompt.txt > "$out" 2>&1 &
# ...poll "$out" until the verdict line appears, then read it.
```

## Render the widget

Build the model by parsing the cold-review output, then render:

```js
import { renderReviewWidget } from "<felag>/skills/widget.mjs";
const model = {
  specName: "taskstore-core",
  round: 3,
  verdict: "REWORK",            // or "MERGE"
  findings: [
    { severity: "critical", text: "ac-foo's fixture passes a wrong impl.", ref: "ac-foo" },
    { severity: "major",    text: "Item 4 MUST is unenforceable from text alone." },
    { severity: "nit",      text: "Typo in the governance preamble." },
  ],
};
const fragment = renderReviewWidget(model);
// → show_widget with `fragment`
```

The panel carries:
- the **round number** and the **verdict pill** (`MERGE` green / `REWORK` amber),
- a **count strip** over critical / major / nit,
- the **findings as cards grouped by severity** (CRITICAL red dot / MAJOR amber /
  NIT gray), each with its text and a **Fold into spec** button
  (`felag: fold <ref-or-text> into the spec`),
- whole-round actions: **Re-review** (`felag: re-review <spec>`) and — only on
  `MERGE` — **Merge** (`felag: merge <spec>`).

A `MERGE` with no findings is a one-line success state — the loop is done.

## One-line lead

Lead with the round and verdict in one line, plus any *judgment* — e.g. "round 3,
REWORK: one critical (the ac-foo fixture is non-discriminating) — the rest are
nits." Never paste the raw reviewer transcript.

## Snapshot, not a feed

Each round is frozen at ask-time. The action buttons don't act — each **drafts**
a `felag:` instruction the human reviews and sends. **Fold into spec** drafts the
spec+fixture edit; **Re-review** re-runs the loop; **Merge** lands the spec. After
folding, re-run and show a fresh round.
