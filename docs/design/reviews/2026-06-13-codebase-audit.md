# Codebase audit → 5.0.1 (2026-06-13)

A whole-codebase release-readiness pass before tagging. Two independent readers:
a six-agent in-context fan-out (slices: core engine, author/CLI, MCP adapter,
tasks/shim, skills/widget, spec/docs coherence) and a **context-stripped cold
review** (`scripts/cold-review.sh`-style: `claude -p` with no loom, no global
CLAUDE.md, no conversation — `--model opus`). The corpus gates were all green
going in; the value was in what green gates miss — the project's signature
defect class, *prose commitments no field or fixture carries*, which only bites
outside the ASCII / millisecond / well-formed-input regime the corpus lives in.

## Convergence (both readers, independently)

| Finding | Resolution |
|---|---|
| `canonical.ts` sorted object keys by UTF-16 code unit, but CS4 mandates Unicode code point (`cmpCodePoint` already existed in `graduation.ts`) — feeds every CS9 hash, so an astral-plane key would hash differently than a conforming writer | **Fixed.** Shared `cmpCodePoint` out of `canonical.ts`; routed CS4 key order, CS8 fixture order, and the `verify` advisory sort through it. Added `fx-canon-astral-key` (a U+FFFF vs U+10000 payload) — a real red→green. |
| CLI had none of the MCP layer's totality: bad/missing input files dumped a raw V8 stack trace and exited **1 — same as a drift verdict** | **Fixed.** Guarded `loadJson`/`loadJsonl`/`loadSpecDir`; a new exit code **3** for I/O failure, distinct from 1 (the spec said no). |
| `instant.ts` truncated sub-ms via `Date.parse` while the spec invokes "differing sub-second precision"; impossible dates (Feb 30) rolled forward engine-dependently | **Fixed (decision: pin to millisecond).** Explicit calendar-range validation (rejects Feb 30 / month 13 / hour 24), deterministic ms truncation. Added `fx-instant-subms-tie` (discriminates ms-pin vs full precision) and `fx-ingest-impossible-date`. Prose clauses added to `it-verification`. |
| Widget HTML had zero injection/escaping tests | **Fixed.** 41 new adversarial tests through every renderer. (Escaping was already sound; now it's guarded.) |
| `check-triplets`/`check-ack-currency` not wired to CI | **Fixed.** Added CI steps; `check-triplets` now also recurses `spec/*/governance/` — the 13 felag-mcp triplets were previously **never** machine-reproduced (now 26/26). |

## Cold reader found, in-context readers missed

- **`npm run self-verify` dirtied the working tree every run** (timestamp-only churn). Fixed: deterministic stamp by default, `--stamp` for a live one.
- `jsStr` didn't escape `\n`/`\r` → an action button silently no-ops on a control char in an id. Fixed.
- CS5 prose was incomplete on lone surrogates (the *inverse* defect: code correct, prose under-specified). Fixed the prose.

## In-context readers found, cold reader missed

- `scripts/smoke-mcp.ts` was dead on arrival (`tool set mismatch`: hardcoded 12, server registers 13) and in no npm script / no CI. Fixed (subset check tolerating `felag_status`) + wired as `npm run smoke`.
- Two skills (`felag-verify`, `felag-audit`) falsely claimed `--json` was an accepted no-op. Removed.
- `flagValue` swallowed a following flag (`--out --target` wrote a file literally named `./--target`). Fixed.
- `validate-author/excavate/prime` were MCP+lib only, no CLI verb (README claimed "twelve tools mirror the CLI verbs"). Added the three CLI verbs.
- beads-shim brittleness (unmapped `JSON.parse` throws; whitespace-id silent drop). Hardened to diagnosable errors + loud rejection.

## Cold reader *corrected* an in-context reader

README "all 55 criteria active and passing, **none inert**" was flagged as false
by the coherence agent (11 of 55 carry no verification record). The cold reader
was right and the agent over-read it: the README's own lifecycle line defines
`proposed` *(inert, a promotion target)* → active, so "inert" means *proposed*,
and all 55 being active makes "none inert" **true**. Phrasing left unchanged.

## Governance note

Adding the two instant regression fixtures mutated `ac-ver-instant-order`, whose
content hash is pinned by a governance ack — the ack-currency guardrail fired,
correctly. Rather than silently editing a ratified criterion, the criterion was
**re-ratified at 5.0.1** through the promotion protocol (new triplet dated
2026-06-13; the 2026-06-12 one retired). This is felag's own machinery handling
a real criterion change. `ac-int-canonical-writer` has no ack, so the astral
fixture needed none.

## Gate after (all green)

`tsc` clean · **318 tests** · `self-verify` CONFORMS (felag-ts 5.0.1 vs
felag-core 5.0.1, 146 records) · felag-tasks-ref + beads-shim CONFORM · 3 specs
lint clean · `npm run smoke` OK · **26/26** governance triplets reproduce · 0
stale acks.

## Deferred (filed, not blocking)

- beads-shim: the marker is still whitespace-delimited and rides a free-text
  description line; a structurally-typed linkage (bd labels/custom fields) and a
  contract-defined backend error code would be the real fix — both are
  felag-tasks spec changes, out of scope for this patch.
- `auditCard` recovers its fixture list by regex-parsing the proposal's English
  description; a structured `fixtures` field on `TaskProposal` would remove the
  coupling.
