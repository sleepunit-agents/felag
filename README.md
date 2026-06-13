# félag

*Old Norse: fé (property) + lag (a laying-together) — a fellowship formed by
laying assets into common stock. The root of English "fellow."*

**A communal contract format for software** — verifiable behavioral specs
that any party can implement with their own language, stack, and taste, plus
the toolchain that authors, audits, and verifies them.

The thesis: in the near future, spec distribution matters more than source
distribution. felag makes the spec the load-bearing artifact: authored as
prose, stored as a strict schema, rendered per audience, and mechanically
verified against any implementation that claims to conform.

## Status

**spec/felag-core 5.0.0 is live, and the reference implementation conforms —
all 55 criteria active and passing, none inert.** Three conformance classes:

- `felag/interchange` (contract `c-interchange`) — canonical JSONL (numbers
  in fixture payloads serialize per RFC 8785), lint, hashing, round-trip,
  index rebuild. Gating.
- `felag/verifier` (contract `c-verification`) — VerificationRecord
  ingestion, waivers, verdict derivation, reports, and **judgment-criterion
  gating** (the graduation function: calibrated agent-judges + reproducibility
  tolerance + verdict provenance). All timestamp comparisons are instant
  comparisons after UTC normalization. Gating.
- `felag/author` (contract `c-author`) — the promotion protocol (ratification
  as a total function), author/excavate output validation, render audience
  projection, prime emission. **Ratified to active in 5.0.0** through the
  promotion protocol itself, after six dogfood ceremonies exercised every verb.

Criterion lifecycle: `proposed` (inert, a promotion target) → `active`, plus
`descriptive` (recorded-true-but-deliberately-not-law, a terminal resting
place for honest archaeology), `deprecated`, and `disputed`.

`felag-ts` (this repo: `src/`) implements all of it and passes the full
fixture corpus (the spec IS the test suite), plus a seeded fuzz pass on the
promotion function's totality claim. Self-verification report:
`verification/felag-ts.report.json` — verdict `conforms`.
A sibling conformance unit, `spec/felag-tasks` 0.1.0, specifies the work
layer; its reference implementation and a beads shim both conform.

```bash
npm install && npm test        # run the corpus (the spec IS the test suite)
npm run self-verify            # emit VerificationRecords + conformance report
node dist/cli.js lint spec/felag-core   # the merge gate (+ orphan-fixture warnings)
```

## MCP server

A second sibling conformance unit, `spec/felag-mcp` 0.1.0 (contract `c-mcp`),
exposes the verbs as MCP tools so any agent drives felag conversationally
instead of shelling out. The contract is deliberately thin: it pins the
*adapter* surface — the pure `mcpDispatch(call, fs)` function's result envelope
(`{ok:true,result}` | `{ok:false,error,detail}`), spec-source resolution
(inline `spec` wins over `specDir`), totality (every thrown library/load error
mapped to a stable `E_*` code, never propagated), and the adapter-shaped tool
results — while the verb *semantics* stay felag-core's contract. The
`@modelcontextprotocol/sdk` stdio wiring is transport, excluded from the
contract exactly as CLI formatting is.

```bash
node dist/mcp/bin.js           # start the stdio server (bin: felag-mcp)
npx tsx scripts/smoke-mcp.ts   # real MCP client round-trip
# Claude Code:  claude mcp add felag -- felag-mcp
```

Twelve tools mirror the CLI verbs: `felag_lint`, `felag_fmt`, `felag_hash`,
`felag_verify`, `felag_audit`, `felag_promote`, `felag_graduate`,
`felag_render`, `felag_prime`, `felag_validate_author`,
`felag_validate_excavate`, `felag_validate_prime`. (`felag_status` is also
routed but excluded from the contracted set — it's presentation.)

## You see it, you don't read it

felag is stored as strict data, but you never read raw JSONL. `felag status`
projects a spec joined to its conformance — every criterion a card whose
column is *derived* (conforming, drifting, proposed, descriptive). Scope it
to a whole spec, one contract, or one criterion's full detail:

```bash
node dist/cli.js status spec/felag-core verification/felag-ts.records.jsonl felag-ts
node dist/cli.js status spec/felag-core ... --json          # the model, for tooling
node dist/cli.js status spec/felag-core ... --serve         # a live-reloading browser dashboard
```

A set of claude-native skills (`felag/skills/`) turn the verbs into
conversational, **widget-driven** commands — the spec pops as a rich,
*actionable* panel (the board with a Spec⟷kanban toggle, the review queue,
the conformance report, the work plan, the cold-review rounds), and buttons
draft governance actions you review and send:

- `/felag new` — the authoring interview: sorts surface into the three strata (contract / profile-binding / excluded), front-loads the stranger test + fixture per criterion, marks ambiguity as `[NEEDS CLARIFICATION]`, ends at proposed + lint-clean and hands off to review
- `/felag status [scope]` — the spec as a board (whole / contract / criterion)
- `/felag review-queue` — proposed criteria, with approve / dispute / descriptive (the HITL ratification surface)
- `/felag verify` — the conformance report
- `/felag audit` — drift → a work plan
- `/felag review` — the cold-review loop to a MERGE verdict, rounds + findings
- `/felag render <audience>` — the audience projection (stakeholder / developer / verifier), switch lens in place
- `/felag lint` — the merge gate as a panel: error cards (code + ref) and orphan-fixture warnings, or one green line when clean

Where a surface invites many small moves before one governance act —
authoring (`new`), ratifying (`review-queue`), filing work (`audit`) — buttons
don't send one at a time; they **stage** into a tray, and one **Send batch**
fills the input with the whole block to sign at once. Install: copy
`felag/skills/*` into your harness's skills dir. felag-core / felag-ts stay
vendor-neutral; the skills are the "felag for Claude" distribution.

Design history (drafts; the compiled spec records are normative):
[design v1.2](docs/design/2026-06-11-felag-design-draft-v1.md) (core
format), the
[author-class contract v0.4](docs/design/2026-06-12-author-class-contract-draft.md)
(five adversarial cold-review rounds — `scripts/cold-review.sh` is the
harness), and the
[compilation findings](docs/design/compilation-findings-v0.md).
The c-author criteria are now ratified (5.0.0) and the governance machinery
has many live runs — promotion drove the judgment-gating and descriptive-state
releases and the author-class ratification itself. Next: Dolt-backed index
storage, and wiring `/felag audit` into the work store.

## Lineage

This project inherits its name and one schema (the Spec kind with
provenance-carrying acceptance criteria) from the retired
[felag-substrate-v0](https://git.one.sleepunit.com/sleepunit-agents/felag-substrate-v0)
experiment. The substrate stays retired; the contract idea lives on.
