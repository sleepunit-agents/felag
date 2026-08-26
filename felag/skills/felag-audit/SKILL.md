---
name: felag-audit
description: "Audit a felag spec: failing gating criteria rendered as fileable work cards."
disable-model-invocation: true
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

`felag audit` emits the `AuditResult` as JSON by default. To **view** the plan,
run it **without** a work-layer flag — the proposals come back as a report
artifact rather than being written anywhere. The action buttons are what file
them (see *Filing to the work store* below).

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

## Filing to the work store

The buttons **stage** `felag:` instructions; the human reviews the tray and
sends. A send is your cue to actually file into **taskstore** (the first-party
work store) — `audit`'s `--taskstore` layer carries the proposals straight in,
and filing is **idempotent** on `(specItemRef, criterionId)`: taskstore dedups
natively, so re-sending or filing an already-tracked gap is a safe no-op.

- **Send all** (`send all N audit proposals to the work store`) → re-run audit
  with the layer attached; it files every failing proposal in one shot:

  ```bash
  node dist/cli.js audit <specDir> <records.jsonl> <implementation> --taskstore [storeDir]
  # --taskstore with no dir uses the ambient store ($TASKSTORE_DB / default);
  # pass a dir to pin <dir>/.taskstore.
  ```

- **Send one** (`send ac-X to the work store`) — when the human curated the
  tray to a subset, file just those, precisely, from the proposal you already
  have in context:

  ```bash
  taskstore create "<proposal.title>" --spec-item-ref "<proposal.specItemRef>" \
    --criterion-id "<criterionId>" --description "<proposal.description>"
  ```

- **Claim** (`claim ac-X`) → `taskstore claim <taskRef>` (the ref comes back in
  the audit `results[]`, or from `taskstore report`).

After filing, show a fresh snapshot (or `/felag status` for the board) — the
newly-tracked tasks now back the plan.

## Snapshot, not a feed

Frozen at ask-time; rerun for a fresh plan (it recomputes from the current
records). The action buttons **draft** `felag:` instructions the human reviews
and sends; the send is what files the task(s) (above).
