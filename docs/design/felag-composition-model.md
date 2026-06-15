# felag composition model — contracts that compose, versioned at the seams

Status: design (converged in conversation 2026-06-15), pre-implementation.
Drives: a multi-phase build (see "Build order"). Dogfooded on felag itself, then loom.

## Problem

Today every felag spec is an island. The data model bottoms out at the **spec**:
one `preamble` (with a single `conformanceVersion`) declaring `contracts`
(`{ id, description }` — no version of their own) over `item`/`criterion`/
`fixture` records. There are exactly four record kinds and **no way for one spec
to reference another**. So:

- A real product is N specs with nothing binding them. "loom" is five separate
  specs (`loom-identity`, `loom-memory`, …); "felag" is three (`felag-core`,
  `felag-mcp`, `felag-tasks`). Nothing says those add up to one thing.
- You cannot express "loom v1 = these pieces at these versions," nor verify a
  product as a whole, nor switch/compose/diagram them from the interface.

## The model: one unit — the contract

A **contract** is a *named interface*: a set of assertions an implementation
must satisfy. This is already how felag treats contracts ("dispatch is a
contract → swappable backend"). The key realization: that is true at **every
level**.

- `c-interchange` is an interface — satisfied by satisfying its criteria.
- `felag-core` is an interface — satisfied by satisfying `c-interchange`,
  `c-author`, … (felag-ts conforms to it).
- `felag` (the product) is an interface — satisfied by satisfying its members.

Same shape every time: **a named interface, satisfied by satisfying its
members**, where a member is either a sub-contract or (at the leaves) a
criterion. It is contracts all the way down. "module", "spec", "product",
"feature" are not separate kinds — they are a contract at a position / with
certain properties.

### Properties accrue; weight is optional

"Same concept" ≠ "same weight." A contract's properties are optional and accrue
as it matures:

| property | lightweight default | when it accrues |
| --- | --- | --- |
| **packaging** | inline in its parent's file | split into its own file (own preamble) |
| **version** | rides its file's version | gets its own version at a file/split boundary |
| **governance** | none | own governance ledger once versioned |
| **position** | required by one | required by many → "shared" |

A "module" is just **a contract that grew up** — accreted its own file and
version. Extraction is therefore not a type conversion; it is "give this
contract its own file + version" — adding properties, not changing kind.

### Versions live at the seams

A contract gets a version **exactly when it is split into its own file**,
because pinning across a file boundary needs a version (`requires foo@1.5`); an
inline member rides its file's version (pinned by being in the same file). So:

> **version boundary = file/packaging boundary = reuse boundary** — one line, one
> decision. "Where do versions stop?" answers itself.

### felag is already half-way here

The `preamble` *is already a contract*: it has `name`, `conformanceVersion`, a
description, and `contracts[]` (its members). A "spec" is therefore already "a
contract that got its own file (a preamble)," and `contracts[]` is its inline
members. The two missing pieces are exactly:

1. **`requires`** — let a member be a *split* contract in another file, pinned at
   a version, instead of only inline.
2. **a version at those split points.**

That's the whole model change. No new "module" concept.

## The top level is a contract, not a manifest

Is the product (`loom`) a contract with its own assertions *and* dependencies —
or just a manifest file pinning pieces at versions?

**A contract.** The whole asserts things its parts don't — *integration*
invariants that live on no single piece:

- "a wake loads the *right* memories" (identity + memory),
- "the brain is never exposed on 0.0.0.0" (transport + identity),
- "talking to loom in Desktop wakes Art with full context" (end-to-end).

A bare manifest has nowhere to hold those; a contract does (its own criteria are
**integration criteria**, verified against the *assembled whole* — same criterion
concept, the implementation-under-test is the composed product). And the pure-
composition case loses nothing: **a manifest is just a contract with zero
criteria of its own.** You get the dumb-pin-file behavior for free, plus the
option to assert integration the day you need it — no migration.

We do **not** introduce a separate manifest/BOM record kind. Maven's BOM exists
because Maven artifacts are heavy and you want a light pin-only thing; our
contract is *already* light (can carry zero criteria), so that reason does not
apply, and adding a second kind would re-fragment the model we just unified.

## Resolution, completeness, release

Borrowed per layer from the prior-art survey (npm/cargo/go; maven/helm/nix;
pnpm/go.work):

- **Resolution = Go-style MVS, exact pins, no ranges.** Conformance *is*
  determinism; semver ranges ("the closure that conformed yesterday resolves
  differently today") defeat the point. Exact pins make the manifest *be* the
  lock; integrity via felag's existing hashing (a `go.sum`-style ledger over the
  closure).
- **Completeness** = the `requires` closure resolves **and** every contract in it
  conforms. "Verify the product" = walk the closure, verify each, roll up to one
  verdict. (Nix's "the closure resolves or it fails" + felag's per-spec verify.)
- **Release** = a contract + its resolved, pinned closure (the reproducible
  snapshot: `loom@1 → {identity@1.5, memory@.16, …}`). **Positional**, not a new
  type — the product is just the contract nothing requires.
- **One version per closure** (Cargo/Go unify). If incompatible majors ever must
  coexist, make the major part of the contract's *identity* (Go's `/v2` trick),
  never silent dual copies. An **undeclared cross-contract reference is a hard
  lint error** (pnpm's phantom-dep lesson) — no implicit edges.

## Vocabulary (labels over one kind)

- **contract** — the universal unit (interface = assertions + members).
- **spec** — a contract with its own file (preamble). The packaging unit.
- **product / module / dependency** — purely positional *labels*: "product" =
  contract at a closure root you ship; "module/dependency" = a contract something
  requires. Driven by a `role` *hint* + position, not a type — so promotion and
  demotion are non-events.

So "loom" is a spec (has a file), a contract (asserts integration invariants +
requires its pieces), and we *call* it the product because nothing requires it.

## Dev workflow + worktrees

felag specs are developed in parallel git worktrees. The model must make
"edit two specs together" and "split a spec" non-events:

- **`requires` floats in dev, pins at release.** One token that means "the local
  working copy in this repo" during dev and is rewritten to a concrete version
  pin at release (pnpm's `workspace:` protocol). Editing `loom-identity` and its
  dependent together requires **zero manifest edits**.
- **Per-dev override stays out of git** (Go's `go.work` is gitignored), so a
  worktree's in-flight edit can never leak into another's release pin — parallel
  worktrees can't poison each other.
- **Extraction = `felag split`**: move the items/criteria/fixtures into a new
  spec file, register it, replace the inline contract with a `requires` edge,
  rewrite references — one command, no publish round-trip (à la `nx move`).
- **Lockfile: regenerate, don't merge** (or per-branch), to dodge the lockfile-
  conflict magnet across worktrees.

## The board UX (recursive)

The board becomes recursive — the same card type at every depth:

```
felag                         (product — the contract nothing requires)   ✓ conforms
├─ felag-core   @6.0.0   "the spec language"               ✓
├─ felag-mcp    @1.2.0   "the MCP transport binding"       ✓
└─ felag-tasks  @0.4.0   "the work layer"                  ⚠ drifts
                  │   drill in ↓  (today's board, unchanged)
                  └─ c-taskstore → items → criteria → fixtures / governance
```

- **Top view of a product** = its required contracts as cards (`name @version`,
  description, conforming rollup), drillable.
- **Drill into one** = the board we already shipped (contracts → items →
  criteria, with the rich drill-down from the widget work).
- One card type, recursive, to the leaves. `requires` is a DAG → the product view
  should **render the graph** (and drill-down is expanding a node).

## Interface goal

The point of all of this: from the MCP interface you can **switch the active
product, start a new one, adopt/compose existing specs, and see/diagram how the
pieces fit** — the registry becoming the workspace + dependency graph, with the
`role` flag marking products vs modules.

## Build order

Felag's own guidance: stand up the resolver/PoC first, then the conformance-
joining surfaces, then the tools. Each phase ends gate-green (330 tests + smoke)
before it merges to `main` (which the live Desktop felag MCP runs from — do not
push half-done model changes there).

1. **Model** — `records.ts`/schema: a contract (preamble + `contracts[]` entries)
   may carry optional `version` + `requires: [ref@version]`. Closure resolver
   (MVS), completeness check, verify roll-up over a closure. Lint: phantom-dep
   error, single-version-per-closure.
2. **Dogfood spec** — author the composition capability *as felag criteria*
   against `felag-core` (+ fixtures), so felag specifies its own dependency
   mechanism and verifies it.
3. **Express felag as a product** — `felag` = a contract requiring
   `felag-core` / `felag-mcp` / `felag-tasks`, plus any felag-level integration
   assertions.
4. **Registry = workspace** — `role` (product|module), closure-aware
   `resolveProject`, register/switch/create-**product**, the dev-float `requires`
   semantics.
5. **Board widget** — recursive product tier (required contracts with
   `@version` + conforming rollup) above the current board; render the `requires`
   DAG.
6. **`felag_project_*` tools** — extend to create a product (with `requires`),
   switch active product, list with `role` + closure status.
7. **Interface goal** — switch / create / start-new / compose from the MCP,
   end-to-end.
8. **Adapt loom** — `loom` = a product requiring
   `loom-core`/`identity`/`memory`/`knowledge`/`strictness`/`transport` + loom
   integration invariants. Same approach, ported.

## Decisions (converged — defaults locked unless revisited)

- Resolution: **MVS, exact pins, no ranges.**
- Release: **positional** (a contract + its lock), not a separate artifact kind.
- Top level: **a contract** (carries integration assertions; manifest = the
  zero-criteria degenerate case).
- module vs contract: **same unit**; "module" = a contract with own file+version.
- `role`: a **label/hint**, not a hard type — promotion/demotion is free.
- Versions live at **file/split boundaries** (= reuse boundary).
- One version per closure; undeclared cross-contract refs are a **lint error**.
