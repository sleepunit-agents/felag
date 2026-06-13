---
name: felag-audit
description: "Use when asked to audit a felag spec, turn drift into a work plan, or see what's left to build/fix to conform — renders audit proposals (one per failing gating criterion) as a show_widget panel of work cards grouped by spec item, each fileable to the work store. Trigger phrases: /felag audit, felag audit, what's left to build, what's left to do, turn this into work, make a work plan."
---

# /felag audit

What's left to make it conform? `felag audit` runs the same conformance check
as `/felag verify`, then turns every **failing gating criterion** into a **work
proposal** — one task per gap, idempotent on (spec item, criterion). This skill
shows those proposals as a work plan you can file with a click.

## The arc

1. **Get the model.** Run `felag audit` — its JSON output is the `AuditResult`
   (`{ report, proposals[] }`).
2. **Show it.** Pipe the result through `renderAuditWidget` and `show_widget`
   the returned fragment.
3. **One-line lead** plus any judgment (e.g. "these 5 cluster on the excavate
   contract — worth doing as one push"). No raw JSON.

## How to run it

`felag audit` emits the `AuditResult` as JSON by default (`--json` is accepted
but unnecessary — a no-op for parity with `felag status --json`). Run it
**without** `--store`/`--beads` here: this skill only *views* the plan, so the
proposals come back as a report artifact rather than being written anywhere.
The action buttons are what file them.

```bash
node dist/cli.js audit <specDir> <records.jsonl> <implementation> [--as-of <iso>] [--waivers <file>]
# or, if installed: felag audit <specDir> <records.jsonl> <implementation>
```

## Render the widget

```js
import { renderAuditWidget } from "<felag>/skills/widget.mjs";
const result = JSON.parse(stdout);
const fragment = renderAuditWidget(result);
// → show_widget with `fragment`
```

The panel carries:
- the proposed **work items** (one per failing gating criterion), **grouped by
  spec item** (the unit audit emits them under — the `AuditResult` carries no
  contract id, so the spec item is the grouping the data supports),
- each a card with the **criterion id**, the proposal **title**, and the
  **fixtures it needs**,
- per-item actions **Send to work store** (`felag: send ac-X to the work
  store`) and **Claim** (`felag: claim ac-X`); the whole plan offers **Send all
  to taskstore**.

If there are no proposals, the panel is a one-line success state — nothing to
do means every gating criterion passes.

## Snapshot, not a feed

Frozen at ask-time; rerun for a fresh plan (it recomputes from the current
records). The action buttons **draft** `felag:` instructions the human reviews
and sends — that send is what creates the task(s) in the work store. After
filing, show a fresh snapshot (or `/felag status` for the board).
