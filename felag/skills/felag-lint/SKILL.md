---
name: felag-lint
description: "Lint a felag spec (valid / errors / orphan fixtures) as a panel."
disable-model-invocation: true
---

# /felag lint

Does the spec lint? `felag lint` is the **merge gate** of the interchange class:
it returns `{valid, errors, orphanFixtures}` — whether the spec is well-formed,
the lint errors (each a `{code, ref}`, e.g. `E_DUPLICATE_ID · ac-foo`), and any
**orphan fixtures** (committed fixtures referenced by no criterion — a warning,
not a gate failure). This skill shows that result as a panel instead of a JSON
dump.

Lint is **diagnostic** — this widget reports, it doesn't govern. There is
nothing to ratify or waive from here; the one action is a re-lint.

## The arc (every felag skill follows it)

1. **Get the model.** Run `felag lint` — its result *is* the model. Prefer the
   `felag_lint` MCP tool: it returns `{valid, errors, orphanFixtures}` directly,
   orphans included (the CLI scatters orphans across stderr — see below).
2. **Show it.** Pipe the result through `renderLintWidget(result, specName)` and
   call `show_widget` with the returned HTML fragment.
3. **One-line lead** plus anything that needs *judgment* (e.g. "two
   `E_MISSING_FIXTURES` — the prose landed without its fixtures again"). Never
   paste the raw result.

## How to run it

**Preferred — the `felag_lint` MCP tool.** It returns the complete shape the
widget wants, orphan fixtures already collected:

```json
{ "valid": true, "errors": [], "orphanFixtures": [] }
```

**CLI fallback.** `felag lint` prints the `{valid, errors}` JSON to **stdout**
and emits orphan-fixture warnings to **stderr**, one per line
(`warning: fixture <id> is referenced by no criterion`). It exits `1` when
invalid (errors present), `0` otherwise — a non-zero exit is itself signal. To
build the widget model you must parse stdout AND scrape the orphan ids out of
stderr:

```bash
node dist/cli.js lint <specDir>
# or, if installed: felag lint <specDir>
```

The orphan warnings are NOT in the JSON — if you only read stdout you will miss
them and a spec with orphans will look clean. This is exactly why the MCP shape
is preferred.

## Render the widget

The lint result is vendor-neutral and carries no spec name; pass the spec's name
as the second argument (or set `result.spec`) so the re-lint intent names it
(falls back to "the spec" otherwise):

```js
import { renderLintWidget } from "<felag>/skills/widget.mjs";
const result = /* felag_lint MCP result, or {valid,errors} + scraped orphans */;
const fragment = renderLintWidget(result, "felag-core");
// → show_widget with `fragment`
```

The panel carries:
- when **clean** (`valid` AND no orphan fixtures): a single green one-line
  success state (`<spec> lints clean`) — no empty sections are forced;
- when **not clean**: a count strip (errors / orphan warnings), then a card per
  error (the **code** as a badge + the **ref** it points at) and a muted card
  per **orphan fixture**;
- a single **Re-lint** action (`felag: re-lint <spec>`).

Orphan fixtures are warnings — they leave `valid` true but are not "clean", so
the panel shows them rather than the green one-liner.

## Snapshot, not a feed

Frozen at ask-time; rerun for a fresh result. The Re-lint button doesn't act —
it **drafts** `felag: re-lint <spec>` the human reviews and sends. To actually
fix what lint flags, edit the spec records (a duplicate id, an undeclared
contract, a missing/unknown fixture, a stray orphan) and re-lint. Then show a
fresh snapshot.
