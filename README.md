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

**spec/felag-core 1.1.0 is live, and the reference implementation conforms.**
All three conformance classes have contracts:

- `felag/interchange` (contract `c-interchange`) — canonical JSONL, lint,
  hashing, round-trip. Gating.
- `felag/verifier` (contract `c-verification`) — VerificationRecord
  ingestion, waivers, verdict derivation, reports. Gating.
- `felag/author` (contract `c-author`) — the promotion protocol
  (ratification as a total function), author/excavate output validation,
  render audience projection, prime emission. **Criteria are
  `state: proposed`**: published and fixtured, gating no one until ratified
  — through the promotion protocol itself.

`felag-ts` (this repo: `src/`) implements all of it and passes the full
fixture corpus (69 fixtures — the spec IS the test suite), plus a seeded
fuzz pass on the promotion function's totality claim. Self-verification
report: `verification/felag-ts.report.json` — verdict `conforms`.
A sibling conformance unit, `spec/felag-tasks` 0.1.0, specifies the work
layer; its reference implementation and a beads shim both conform.

```bash
npm install && npm test        # run the corpus (the spec IS the test suite)
npm run self-verify            # emit VerificationRecords + conformance report
node dist/cli.js lint spec/felag-core   # the merge gate (+ orphan-fixture warnings)
```

Design history (drafts; the compiled spec records are normative):
[design v1.2](docs/design/2026-06-11-felag-design-draft-v1.md) (core
format), the
[author-class contract v0.4](docs/design/2026-06-12-author-class-contract-draft.md)
(five adversarial cold-review rounds — `scripts/cold-review.sh` is the
harness), and the
[compilation findings](docs/design/compilation-findings-v0.md).
Next milestone: a real `felag/author` implementation, then ratifying the
c-author criteria via `promote()` — the governance machinery's first
end-to-end run is its own activation.

## Lineage

This project inherits its name and one schema (the Spec kind with
provenance-carrying acceptance criteria) from the retired
[felag-substrate-v0](https://git.one.sleepunit.com/sleepunit-agents/felag-substrate-v0)
experiment. The substrate stays retired; the contract idea lives on.
