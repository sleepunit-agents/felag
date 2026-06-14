---
name: felag-render
description: "Use when asked to render a felag spec for an audience, see what a stakeholder/developer/verifier sees, or project a spec for a reader — renders the audience content inventory as a show_widget panel (audience toggle, the included record ids as chips, the excluded fields as muted hidden chips). Trigger phrases: /felag render, felag render, what does the stakeholder/developer/verifier see, render the spec for, audience projection."
---

# /felag render

What does each reader actually see? `felag render` projects a spec for an
**audience** — `stakeholder`, `developer`, or `verifier` — and returns a
**content inventory**: the exact set of record ids that audience sees
(`included`), the fields projected out for them (`excludedFields`), and — for
the verifier — the fixtures that declare a `projection` (their format models the
impl, not its wire format) as a distinct `projections` group to audit for
fidelity. It is a content projection, never typesetting. This skill shows that
inventory as a panel instead of a JSON dump.

The three audiences are a visibility ramp:
- **stakeholder** — items and active criteria; no fixtures, no internal fields.
- **developer** — items, criteria, and fixtures; every field visible.
- **verifier** — the full record, including deprecated criteria.

## The arc (every felag skill follows it)

1. **Get the model.** Run `felag render` for the audience — its JSON output
   *is* the inventory.
2. **Show it.** Pipe the inventory through `renderRenderWidget(inventory,
   audience)` and call `show_widget` with the returned HTML fragment.
3. **One-line lead** plus anything that needs *judgment* (e.g. "the stakeholder
   view hides 11 fields — fixtures and all the discovery provenance"). Never
   paste the raw inventory.

## How to run it

`felag render` emits the inventory as JSON by default — there is no HTML mode to
switch off, so `--json` is accepted but unnecessary (a harmless no-op, there for
muscle-memory parity with `felag status --json`):

```bash
node dist/cli.js render <specDir> --audience <stakeholder|developer|verifier>
# or, if installed: felag render <specDir> --audience verifier
```

`--audience` is required and must be one of the three (exit `2` otherwise). The
`felag_render` MCP tool returns the same `{included, excludedFields, projections}` inventory
if you'd rather go through MCP.

## Render the widget

The inventory is vendor-neutral and carries no spec name. Set `inventory.spec`
to the spec's name before rendering so the audience-toggle re-render intents
name it (it falls back to "the spec" otherwise):

```js
import { renderRenderWidget } from "<felag>/skills/widget.mjs";
const inventory = JSON.parse(stdout);
inventory.spec = "felag-core";          // so re-render intents name the spec
const fragment = renderRenderWidget(inventory, "stakeholder");
// → show_widget with `fragment`
```

The panel carries:
- an **audience toggle** (Stakeholder / Developer / Verifier) with the current
  audience pressed — each button **drafts** a re-render
  (`felag: render <spec> for <audience>`),
- the **included record ids** as a compact chip list,
- the **excluded fields** as muted, struck-through "hidden from this audience"
  chips.

When `excludedFields` is empty (developer and verifier), the panel shows a
one-line "every field is visible" state instead of an empty section.

## Snapshot, not a feed

Frozen at ask-time for one audience. Unlike `/felag status`'s Spec⟷Board toggle
(which holds both views client-side), each audience is a *different* projection —
so switching audience **re-renders**. The toggle buttons don't act; each drafts
`felag: render <spec> for <audience>`, the human reviews and sends, and a fresh
snapshot for that audience follows.
