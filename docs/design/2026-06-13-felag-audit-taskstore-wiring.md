# felag audit → taskstore wiring (t-1)

Let `felag audit` file conformance drift directly into the live taskstore
sqlite work store — the same way it already files into the toy JSON `TaskStore`
(`--store`) and the beads shim (`--beads`). Built in three sequenced steps.

## Context

- `audit(input, layer?)` already produces idempotent `TaskProposal`s (one per
  failing gating criterion) and calls `layer.propose()` per proposal when a
  `WorkLayer` is attached. Idempotency lives in the layer.
- `WorkLayer` = `propose(proposal) → ProposalResult` · `report() → {entries}` ·
  `transition(taskRef, to) → {ok}`. Two impls exist: `TaskStore` (reference,
  JSON file) and `BeadsWorkLayer` (`src/shims/beads.ts`, shells to `bd`).
- **taskstore already conforms to felag-tasks** and carries felag linkage as
  *first-class structured fields* — `--spec-item-ref` / `--criterion-id`, with
  native idempotency on `(specItemRef, criterionId)`. Verified against the live
  CLI: `create` returns `{created, id, ok, errors}` (re-create → same id,
  `created:false`); `report` returns exactly `{entries:[{taskRef, specItemRef,
  criterionId, status}]}` (contract-shaped, `closed→done`). So the felag-side
  adapter needs **no description-marker** — a strict improvement over the beads
  shim, whose whitespace-delimited marker the 2026-06-13 audit flagged as brittle.

## Step 1 — `TaskstoreWorkLayer` adapter + `felag audit --taskstore`

- New `src/shims/taskstore.ts`: a `WorkLayer` that shells to the `taskstore`
  binary via `execFileSync`. Store selection: `--taskstore <dir>` runs taskstore
  with `cwd=dir` (taskstore resolves `$TASKSTORE_DB` else `./.taskstore/store.db`
  relative to cwd); no dir → inherit cwd / env.
  - `propose` → `taskstore create <title> --spec-item-ref <ref> --criterion-id
    <c> [--description <d>]`; parse `{created, id, ok, errors}` (guarded
    `JSON.parse`) → `ProposalResult`. Native idempotency, no pre-list scan.
  - `report` → `taskstore report` → pass `{entries}` through (already contract-
    shaped and sorted).
  - `transition(taskRef, to)` → lifecycle verbs: `done`→`close`, `cancelled`→
    `close --reason cancelled`, `in_progress`→`claim`, `open`→`reopen`; return
    `{ok}`. Unmapped/precondition failure → `{ok:false}` (total).
- `src/cli.ts` `loadLayer`: add a `--taskstore [dir]` branch → `new
  TaskstoreWorkLayer(dir)`, `flush` = noop (taskstore persists itself). Add to
  the `audit`/`tasks` usage strings.
- Test `test/tasks-shim-taskstore.test.ts`: drive propose/report/transition
  against a fresh temp store. **Skips gracefully if `taskstore` is not on PATH**
  (mirrors how the beads test depends on `bd`).

## Step 2 — wire the `/felag audit` skill to land in taskstore

- `felag/skills/felag-audit/SKILL.md` + `felag/skills/widget.mjs`: the audit
  widget's "send to work store" buttons currently *draft* an instruction into
  the staging tray. Keep the human-in-the-loop staging (draft → review → send),
  but make the **Send batch** action actually run `felag audit … --taskstore`
  (or `taskstore create` per card) so the tasks land in the live store. The
  staging/review UX is unchanged; only the terminal action becomes real.

## Step 3 — felag-side conformance record for the adapter

- Extend `test/tasks-shim-taskstore.test.ts` to run the **felag-tasks fixture
  corpus** through `TaskstoreWorkLayer` against a temp store (as
  `tasks-shim-beads.test.ts` does for `bd`).
- Emit `verification/felag-tasks-taskstore-shim.{records,report}.json` via the
  `self-verify-tasks` path, proving taskstore-via-felag's-adapter CONFORMS to
  felag-tasks. (taskstore proves its own conformance independently; this proves
  the *adapter* honors the contract.)

## Verification per step

Step 1: build + the new integration test green, plus a live smoke against a
temp store. Step 2: skill tests green, a manual widget render check. Step 3:
`self-verify-tasks` reports the taskstore-shim CONFORMS; full gate stays green.

## Non-goals

- No changes to the felag-tasks contract or taskstore itself (taskstore already
  conforms; this is purely the felag-side driver).
- Not replacing `--store`/`--beads`; `--taskstore` is an additional layer.
