# felag self-compilation — findings v0

*2026-06-11. First compilation of felag-core into the felag interchange format,
performed cold: the only source consulted was
[design draft v1](2026-06-11-felag-design-draft-v1.md) (including both review
disposition tables). Output: `spec/felag-core/{spec.jsonl,fixtures.jsonl,schema.json}`
at conformanceVersion 0.1.0. Where the document was ambiguous or silent, a choice
was made, applied consistently, and recorded here — choices are flagged
**[derived]** in the spec bodies themselves where they are normative.*

---

## 1. Decisions the document delegated to compilation

These are not complaints; the document explicitly defers them ("the precise
canonicalization rules are written during compilation"). They are listed so a
reviewer can ratify or veto each.

### D-A. Canonical serialization (CS1–CS9, normative in item `it-interchange`)

1. **CS1** UTF-8, no BOM, LF, exactly one trailing LF, no blank lines/comments.
2. **CS2** One JSON object per line, no insignificant whitespace.
3. **CS3** Discriminator field `record`: `preamble | item | criterion | fixture`.
4. **CS4** Key order: `record` first, `id` second when present, remaining keys
   ascending by code point; nested object keys ascending by code point.
   (Chosen over per-type pinned orders because it is checkable without tables.)
5. **CS5** Minimal escaping: only `"` `\` and U+0000–U+001F; short escapes where
   defined, else `\u00xx` lowercase; non-ASCII emitted raw.
6. **CS6** Integers only; no non-integer numeric fields exist in the format.
7. **CS7** spec.jsonl order: preamble, then items in author order, each followed
   by its criteria in author order.
8. **CS8** fixtures.jsonl order: ascending by id.
9. **CS9** `fixtureHash` = `sha256:` + lowercase hex SHA-256 of the fixture's
   canonical record line (UTF-8, no trailing LF).

Plus: **readers liberal, writers strict** — readers must accept any schema-valid
serialization; only writers are held to canonical form (the document never says
which side the requirement binds; binding readers too would make round-tripping
third-party files impossible).

### D-B. Record granularity and file layout

The document's data model is a nested tree (`sections[] → SpecItem →
acceptanceCriteria[]`) but the stored form is "line-oriented JSONL" whose whole
point is per-line diff/blame/merge. Nesting a SpecItem with its criteria on one
line would put every criterion edit on the same diff line. **Chose:** flat
records with parent references (`criterion.itemId`); two files per spec,
`spec/<name>/spec.jsonl` + `spec/<name>/fixtures.jsonl` (the document says
"interchange files" and "interchange directory" without ever defining the
layout — that is open question 4, but a layout had to exist today).

### D-C. Tool result formats and the verdict algorithm

The document defines one wire object (VerificationRecord) and zero tool
outputs, yet fixtures need `expected` values and verifier-class conformance is
"produces reports". **Invented:** `lintResult` `{valid, errors:[{code,ref}]}`
with five error codes; `ingestResult` `{accepted, errors:[code]}`;
`conformanceReport` `{advisory, conformanceVersion, disputed, failing,
implementation, verdict, waived}`; and the derivation algorithm D1–D6 in item
`it-verification` (latest-record-per-(criterion,fixture,impl,version) wins;
stale `fixtureHash` ⇒ record ignored; waiver expiry vs `asOf`; verdict
precedence drifts > conforms-with-waivers > conforms). All of these are now
contract surface that exists only in the compiled spec, not in the document.

## 2. Findings — ambiguities, contradictions, surprises

**F1 — The gating conjunction contradicts the disputed-state semantics
(contradiction).** Gating requires `state: active` ("a criterion gates ... only
if all hold: ... state: active ..."), but the disputed state "continues to gate
everyone else". A disputed criterion is not active, so read literally it gates
no one — which would make dispute exactly the "cheaper deprecation" the
document forbids. **Resolved:** gating states are `active` and `disputed`, with
disputed excluded only for the disputing implementer (item `it-gating`,
fixtures `fx-verdict-disputed-*`). The document should restate the conjunction.

**F2 — Dispute attribution has no schema home, and needs semantics the
document forbids (insufficiency + latent contradiction).** The criterion schema
has the `disputed` state but no field saying *who* disputes; per-implementer
un-gating is uncomputable without it. **Added** `dispute: {by, reason, at}`.
But note: `dispute.by` must match the implementation name in reports — it
*selects behavior*, while the document insists attribution-shaped fields are
"free-form strings with no semantics" that implementers "MUST NOT build
behavior on". `dispute.by` is therefore a roster reference, not an attribution
string; the document should say so explicitly or the no-semantics rule will be
read as forbidding the dispute mechanism's own plumbing.

**F3 — `fixtureHash` interops on rules the document doesn't pin
(insufficiency).** VerificationRecords carry a "hash over canonical fixture
serialization", so two independent toolchains must agree byte-for-byte on
canonical form *and* on a hash algorithm the document never names — before any
compiled spec exists. Deferring key order to compilation is defensible;
deferring the hash algorithm silently breaks the verification contract between
any two implementations that compiled independently. CS9 pins SHA-256; the
document should adopt the algorithm (and probably CS4/CS5) into v1.2 rather
than leave them spec-resident only.

**F4 — "A gating criterion missing contractId" cannot exist (surprise; the
brief for this very compilation tripped on it).** Per the document's own
definition, a criterion without `contractId` is *advisory*, not invalid — there
is nothing for lint to reject. The mechanically checkable lint obligations are:
(a) a `contractId` not declared in the preamble (`E_UNDECLARED_CONTRACT`), and
(b) a behavioral criterion with a declared contract and empty fixtures
(`E_MISSING_FIXTURES`). Both are fixtured. The compilation brief asked for a
fixture of the impossible case, which is itself evidence the misreading is
natural; one clarifying sentence in the document would prevent it.

**F5 — Verdicts are time-dependent but no evaluation clock exists
(insufficiency).** Waiver expiry ("expired waivers are failures again") makes
every verdict a function of *when* you ask, and nothing in the document defines
that instant — fixtures would be non-deterministic. **Added** `asOf` to the
verify input (`felag/verify-input@0`). Related under-specification resolved in
D1–D6: conflicting/multiple records (latest by `at` wins), per-fixture rather
than per-criterion pass granularity, and `unverifiable` treated as not-pass.

**F6 — The document's loudest rules are unenforceable in its own conformance
model (surprise).** Two cases. (i) *Versioning*: "additive MUST = MAJOR" etc.
are MUSTs, but no verb is obligated to check them — lint's "version-bump
consistency" is named with unspecified inputs (previous version? both
branches?) — so the versioning criteria ship advisory, unable to gate. (ii)
*The refusals*: "verify never executes anything", "attribution carries no
semantics", "nothing in conformance depends on any vendor" are not mechanically
fixturable, and the document's own gating rule (behavioral-only, fixtures
required) therefore bans them from gating forever. The design's core identity
commitments are protected by its weakest enforcement tier. Possibly fine —
but the document should own it.

**F7 — `felag/author` is a conformance class with no contract (insufficiency).**
The class has verbs (author, excavate, render, prime) and a label ("partially
judgment-verified") but the interview/render/promotion protocols it would be
verified against are never specified. Author-class conformance is unverifiable
from this document; recorded as an explicit preamble exclusion at 0.1.0.

**F8 — Section vs SpecItem is one concept or two (ambiguity).** `sections[] →
SpecItem {…}` reads, by the document's own arrow convention
(`acceptanceCriteria[] → AcceptanceCriterion`), as "sections is an array of
SpecItem" — yet the prose mentions both words. **Chose:** one record type,
`item`. If a grouping level above items is intended, the schema needs it
stated.

**F9 — Small schema gaps, each resolved by fiat:**
- `implementers: [{name, role(s)}]` — roles undefined; chose free-form
  `roles: [string]`, non-empty.
- VerificationRecord required-ness — only `fixtureId?`/`fixtureHash?` carry
  `?`; made every other field required (including `evidence`, per commitment 3
  "evidence-carrying").
- `Fixture.contractId` is required, so advisory (contract-less) criteria can
  never have fixtures even voluntarily. Accepted as-is; worth a deliberate
  look.
- Whether judgment criteria may carry a `contractId` — allowed (they remain
  non-gating and fixture-exempt); used for traceability on
  `ac-ver-ledger-not-runner` and `ac-ver-attribution-opaque`.

**F10 — Self-application worked, with one wrinkle worth keeping (observation).**
The compiled spec passes its own lint rules (unique ids; gate ⊆ allowlist;
every gating behavioral criterion fixtured; canonical serialization applied to
its own files — verified mechanically during generation, including a byte-level
round-trip of both files and of the embedded `fx-roundtrip-min` text). The
wrinkle: verdict fixtures must embed an entire mini-spec inside fixture
`input`, so the interchange format now appears at two nesting levels with two
representations (text for round-trip fixtures, parsed records for verify
fixtures). Workable, but the document should bless a single "spec as fixture
payload" convention.

## 3. Criteria census

| | gating (contract + fixtures) | advisory | total |
|---|---|---|---|
| behavioral | 14 | 3 | 17 |
| judgment | 0 (graduation bar absent by design) | 5 | 5 |
| **total** | **14** | **8** | **22** |

Fixtures: 16 (6 under `c-interchange`, 10 under `c-verification` — counting by
contract of the *fixture*; every gating criterion references ≥1, two criteria
share `fx-roundtrip-min` deliberately). Items: 8. Contracts: 2. The
judgment-lopsidedness the document predicts for EARS checklists held exactly:
all 5 judgment criteria are checklists; all scenario criteria earned fixtures.

## 4. Compatibility verdict

**From the document alone: no.** A second implementer would diverge with
certainty on serialization (key order, escaping, layout), the hash algorithm,
every tool output format, the verdict algorithm's edge cases, and the dispute
schema — five independent coin flips, any one of which breaks byte-level
interop or verification exchange.

**From the document plus `spec/felag-core/`: yes, with stated residue.** For
`felag/interchange` and `felag/verifier`, the fixtures pin the surfaces that
were coin flips: byte-exact canonical form (`fx-roundtrip-min`,
`fx-canon-noncanonical`), the hash (`fx-fixture-hash`), lint rejections,
ingestion, and all four verdict tokens including waiver expiry and
per-implementer dispute scoping. An implementer who passes the 16-fixture
corpus should exchange files and records with this one. Residual divergence
risk, in order: (1) lint/ingest behavior outside the fixtured error cases
(multi-error ordering is stated in prose, fixtured only for the two-code ingest
case); (2) D1's conflicting-record tie-break and `unverifiable` handling —
stated, not fixtured; (3) report field semantics under combinations not
fixtured (e.g. waived *and* disputed simultaneously); (4) `felag/author`,
which is not verifiable by anyone yet. Items (1)–(3) are exactly what the next
MINOR bump should add fixtures for; (4) needs its contract written first.
