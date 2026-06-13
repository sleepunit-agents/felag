---
name: felag-review-queue
description: "Use when asked for the felag review queue, proposed criteria, or what's waiting to be ratified on a felag spec — renders proposed criteria as a show_widget panel of cards, each with approve / make descriptive / dispute buttons. This is the human-in-the-loop ratification surface. Trigger phrases: /felag review-queue, felag review queue, what's proposed, what needs ratifying."
---

# /felag review-queue

The human-in-the-loop ratification surface. The same status model as
`/felag status`, filtered to **proposed** criteria — the ones waiting for a
human to sign them. Each card carries the governance actions; your click is
the act, and it lands in the transcript (auditable).

## The arc

1. **Get the model** — the same projection `/felag status` uses (see below).
2. **Show it** — pipe the model through `renderReviewQueueWidget` and
   `show_widget` the returned fragment.
3. **One-line lead** plus any judgment (e.g. "ac-foo looks under-specified —
   consider dispute"). No raw JSONL.

## How to run it

Resolve the model exactly as `/felag status` does (it's the same model; the
widget does the proposed-only filter):

- **MCP:** call `felag_status` with the spec; use `env.result.model`.
- **CLI:**

  ```bash
  node dist/cli.js status <specDir> [<records.jsonl> <impl>] --json
  # or: felag status <specDir> --json
  ```

## Render the widget

```js
import { renderReviewQueueWidget } from "<felag>/skills/widget.mjs";
const model = JSON.parse(stdout);       // or env.result.model
const fragment = renderReviewQueueWidget(model);
// → show_widget with `fragment`
```

The panel shows **only proposed criteria**, each a card with three buttons:
- **Approve** — ratify the criterion (promote proposed → active),
- **Make descriptive** — reclassify it as descriptive (documents behavior, gates
  no one),
- **Dispute** — flag it as contested.

If nothing is proposed, the panel says so — a clear queue is a good state.

## Snapshot, not a feed

Frozen at ask-time; rerun for fresh. Each button **drafts** a `felag:`
instruction the human reviews and sends — that send is the ratification. When
sent, run the felag governance protocol it asks for (promote / amend), then
show a fresh snapshot.
