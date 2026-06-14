---
name: felag-verify
description: "Use when asked to verify a felag spec, check conformance, or whether an implementation conforms/drifts — renders the conformance report as a show_widget panel (verdict pill, failing/waived/disputed count strip, the criterion ids as cards). Trigger phrases: /felag verify, felag verify, is it conforming, does it conform, check conformance, what's failing."
---

# /felag verify

Is the implementation conforming? `felag verify` ingests the verification
records and derives a **conformance report** — a verdict (`conforms` /
`conforms-with-waivers` / `drifts`) plus the criterion ids that are failing,
waived, or disputed. This skill shows that report as a panel instead of a JSON
dump.

## The arc (every felag skill follows it)

1. **Get the model.** Run `felag verify` — its JSON output *is* the report.
2. **Show it.** Pipe the report through `renderVerifyWidget` and call
   `show_widget` with the returned HTML fragment.
3. **One-line lead** plus anything that needs *judgment* (a recommendation —
   e.g. "ac-foo has been failing since the last graduate; worth a look"). Never
   paste the raw report.

## How to run it

`felag verify` emits the report as JSON by default — there is no HTML mode to
switch off:

```bash
node dist/cli.js verify <specDir> <records.jsonl> <implementation> [--as-of <iso>] [--waivers <file>]
# or, if installed: felag verify <specDir> <records.jsonl> <implementation>
```

All three positional arguments are required (the spec dir, the verification
records, and the implementation name). Exit code is `1` when the verdict is
`drifts`, `0` otherwise — so a non-zero exit is itself signal.

## Render the widget

```js
import { renderVerifyWidget } from "<felag>/skills/widget.mjs";
const report = JSON.parse(stdout);
const fragment = renderVerifyWidget(report);
// → show_widget with `fragment`
```

The panel carries:
- the **verdict pill** (conforms / conforms-with-waivers / drifts),
- a **count strip** over failing / waived / disputed,
- the **failing, waived, and disputed criterion ids** as cards. A *failing*
  card offers **Open as work** (`felag: open ac-X as work`) and **Why it fails**
  (`felag: show me why ac-X fails`); the whole report offers **Re-verify** and
  **Audit into work plan**.

If the verdict is `conforms` with nothing outstanding, the panel is a one-line
success state — no empty columns are forced.

## Snapshot, not a feed

Frozen at ask-time; rerun for a fresh report. The action buttons don't act —
each **drafts** a `felag:` instruction the human reviews and sends. When a
failing card sends `open ac-X as work`, file it (via `/felag audit` or the work
store); when it sends `show me why ac-X fails`, dig into the failing fixtures'
records. Then show a fresh snapshot.
