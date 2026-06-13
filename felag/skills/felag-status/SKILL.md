---
name: felag-status
description: "Use when asked for felag status, the spec board, or to show me the spec/board for a felag spec — renders the spec joined to its conformance as a show_widget panel (the board: spec ⟷ kanban over the same criterion cards), scope-aware to a whole spec, one contract, or one criterion. Trigger phrases: /felag status, felag status, show me the spec, show me the board."
---

# /felag status [scope]

The daily surface. felag is authored and stored as strict data, but you never
read raw JSONL — `/felag status` shows the spec as a rich panel: every
criterion is a card whose column is *derived* (conforming, drifting, blocked,
proposed, descriptive), and the same panel is both the spec view and the
kanban, toggled over one set of cards.

## The arc (every felag skill follows it)

1. **Get the model.** Run the felag status projection (a JSON model).
2. **Show it.** Pipe the model through `renderStatusWidget` and call
   `show_widget` with the returned HTML fragment.
3. **Keep prose to a one-line lead** plus anything that needs *judgment* (a
   recommendation, a flagged risk). Never paste raw JSONL or a record dump.

## How to run it

Resolve the model, preferring the MCP tool when it's wired:

- **If the `felag_status` MCP tool is available:** call it with the spec (and
  records/implementation if a ledger exists, plus `target` for scope). It
  returns `{ model, html }`; use `model`.
- **Otherwise, via the CLI** (from the felag repo, or wherever `felag` is on
  PATH):

  ```bash
  node dist/cli.js status <specDir> [<records.jsonl> <impl>] [--target <id>] --json
  # or, if installed: felag status <specDir> [<records.jsonl> <impl>] [--target <id>] --json
  ```

  `--json` emits the `computeStatus` model to stdout instead of HTML. Records
  are optional — without them every active criterion shows as `unverified`
  (still a useful spec view). `--target <id>`:
  - a **contract id** → that one contract's section
  - a **criterion id** → that criterion's full detail card (scenario, fixtures,
    conformance)
  - omitted → the whole spec

## Render the widget

```js
import { renderStatusWidget } from "<felag>/skills/widget.mjs";
const model = JSON.parse(stdout);       // or env.result.model from the MCP tool
const fragment = renderStatusWidget(model);
// → show_widget with `fragment`
```

The panel carries:
- a **summary strip** (count per status),
- a **Spec ⟷ Board toggle** over the same cards (proving they're one thing),
- **action buttons** per card: a *proposed* criterion offers approve / make
  descriptive / dispute; a *drifting* one offers see failures / waive; the
  whole spec offers re-verify / audit.

## Snapshot, not a feed

The widget is **frozen** at the moment you asked — there is no polling. For a
fresh view, run the skill again. (For a board to *watch*, `felag status
--serve` opens a live-reloading dashboard in the browser; that's a different
surface and not this skill's job.)

The action buttons don't act — each **drafts** an instruction (`felag:
<plain-English intent>`) into the prompt. The human reviews it and sends it;
*that click is the governance act*. When sent, run the felag protocol it asks
for, then show a fresh snapshot.
