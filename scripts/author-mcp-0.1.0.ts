// Ceremony 6 (t-15): author spec/felag-mcp 0.1.0 — the MCP adapter contract.
//
// A new sibling conformance unit (like spec/felag-tasks), NOT an item in
// felag-core. felag-core owns the verb SEMANTICS (felag-ts CONFORMS); this
// contract owns only the MCP adapter surface a second implementation could
// diverge on: the pure dispatch function's result envelope, spec-source
// resolution (inline-vs-path precedence), totality (thrown library/load errors
// mapped to {ok:false}, never propagated), and the adapter-shaped tool results.
//
// Builds spec.jsonl + fixtures.jsonl through the library (serialize/sortFixtures/
// fixtureHash — never hand-formatted). Mechanical fixture values (hashes,
// canonical strings, the pass-through core results) are COMPUTED via the lib;
// the contract decisions (envelope shape, error codes, orphan/resolution logic)
// are authored by hand. Validates with lint + validateAuthorOutput, writes
// canonical interchange. New criteria land `proposed` (except the descriptive
// seam); ratification is the promotion protocol's (promote-mcp-0.1.0.ts).

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fixtureHash, parse, serialize, sortFixtures } from "../src/canonical.js";
import { lint } from "../src/lint.js";
import { verify } from "../src/verify.js";
import { audit } from "../src/audit.js";
import { promote } from "../src/promotion.js";
import { graduate } from "../src/graduation.js";
import { emitPrime } from "../src/prime.js";
import {
  renderInventory,
  validateAuthorOutput,
  validateExcavateOutput,
  validatePrimeOutput,
} from "../src/author.js";
import type {
  Criterion,
  Fixture,
  Item,
  Preamble,
  SpecRecord,
  VerificationRecord,
} from "../src/records.js";

const dir = join(import.meta.dirname, "..", "spec", "felag-mcp");

// ---------------------------------------------------------------------------
// Preamble
// ---------------------------------------------------------------------------

const preamble: Preamble = {
  record: "preamble",
  name: "felag-mcp",
  conformanceVersion: "0.1.0",
  goals: [
    "Expose the felag toolchain's verbs as MCP tools so any agent drives felag conversationally — lint a spec, verify conformance, run the author-class validators, promote, graduate — without shelling out to the CLI.",
    "Pin the adapter surface, not the verbs: a second MCP implementation in any language conforms by matching the pure dispatch function's behavior, while reusing whatever felag-core implementation it already has for the verb semantics.",
    "Keep the adapter total and honest: every thrown library or load error becomes a structured result, and the model is never asked to trust an MCP server that crashed instead of answering.",
  ],
  contracts: [
    {
      id: "c-mcp",
      description:
        "The MCP adapter contract: the pure dispatch function over (tool-call, filesystem snapshot) -> result envelope. Owns spec-source resolution and its inline-vs-path precedence, totality (every thrown library or load error mapped to a structured {ok:false,error,detail} result, never propagated), and the result shape each tool returns. The verb cores are felag-core's contract; a tool that is a pure pass-through to a conformant core is specced only at its adapter boundary, never re-stated.",
    },
  ],
  exclusions: [
    "The verb semantics themselves: lint, verify, audit, promote, graduate, render, prime, hash, fmt, and the author-class validators are spec/felag-core's contract (felag-ts CONFORMS). This contract never re-states them; a tool that is a pure pass-through is specced only at its adapter boundary (I/O resolution + result wrapping + error mapping).",
    "The MCP transport: stdio framing, JSON-RPC, the @modelcontextprotocol/sdk wiring, the tools/list and tools/call envelopes, and how a host renders a result. The contract is the pure dispatch function; the server is an un-specced binding over it, exactly as CLI output formatting is non-core in felag-core.",
    "Tool input JSON Schemas as advertised to a host (each tool's MCP inputSchema): advisory ergonomics, observable but undeclared. The contract gates on dispatch behavior given an input, not on the schema a host uses to build that input.",
    "Filesystem access: how the server reads a specDir from disk is transport. The contract models the filesystem as an explicit path->content snapshot passed to dispatch, so path-loading is a pure, fixturable function; real file I/O lives in the server binding.",
    "Statefulness: audit's optional work-layer wiring (spec/felag-tasks) is stateful; the audit tool exposes only the pure coverage projection with no work layer attached. Work mutation through MCP is out of scope.",
    "MCP adapter residue at 0.1.0: E_LIB is the catch-all for any felag-core library throw not classified as E_PARSE. Its triggers depend on felag-core's INCIDENTAL throwing behavior, which felag-core does not make contractual: serialize's CS6 refusal of a non-finite number (itself unfixturable — a JSON fixture cannot encode the value whose refusal it would pin), or a core verb throwing on a degenerate input (e.g. verify on a spec with no preamble, or render given an out-of-enum audience). Because none of these throws is a felag-core guarantee, none can be pinned by a stable cross-implementation fixture; the obligation rides on prose and the dispatch implementation. The fixturable, contractually-stable totality case is E_PARSE; that dispatch maps a non-McpError throw to E_LIB rather than propagating it is pinned by a reference-implementation unit test, not a contract fixture.",
  ],
  governance: { timeoutDays: 30 },
  implementers: [{ name: "felag project", roles: ["repo-owner"] }],
};

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const items: Item[] = [
  {
    record: "item",
    id: "it-mcp-dispatch",
    title: "Dispatch and the result envelope",
    body:
      "Every MCP tool call resolves through a single pure function, mcpDispatch(call, fs), where call is {tool, input} and fs is a filesystem snapshot (below). It returns a result envelope: a discriminated union of {ok:true, result} on success and {ok:false, error, detail} on failure. result is the tool's payload (the verb's result, possibly adapter-shaped); error is a stable machine code (E_*); detail is a required non-empty human-readable string whose WORDING is non-normative but whose presence and type are normative.\n\nDispatch is TOTAL: it never throws and never propagates an exception to the transport. The error partition is closed and a second implementation MUST match the CODE: E_UNKNOWN_TOOL (the tool name is absent from the registry); E_NO_SPEC_SOURCE and E_SPEC_NOT_FOUND (spec resolution, see it-mcp-resolve); E_BAD_INPUT (a REQUIRED input is absent — asOf/implementation for verify and audit, asOf/transition for promote, criterionId/implementation for graduate, audience for render, output for validate_prime, or neither records nor text for fmt); E_PARSE (interchange that does not parse, whether the fmt text or a snapshot file); and E_LIB (the catch-all for any other thrown felag-core library error). The error CODE is the divergence point; this totality is the verify-is-a-ledger stance (felag never crashes the caller) carried to the tool layer.\n\nTwo partition rules a stranger needs to reproduce the codes exactly. Ordering: EVERY required input for the tool — scalar or object, e.g. asOf, transition, audience, output, criterionId, implementation — is checked BEFORE spec-source resolution, so when a call lacks both a required input AND a spec source, E_BAD_INPUT precedes E_NO_SPEC_SOURCE/E_SPEC_NOT_FOUND (felag_render with no inputs is E_BAD_INPUT on audience, not E_NO_SPEC_SOURCE). Nullity: for a required input, a JSON null is treated as absent (E_BAD_INPUT), identically to a missing key — a present null is never forwarded to a verb.\n\nThe presence/validity line is deliberate: the adapter checks only that a required input is PRESENT (a structural check it can make without verb knowledge) and maps absence to E_BAD_INPUT; an input that is present but semantically invalid (e.g. an out-of-enum render audience) is the core verb's to reject, and the core rejecting it by throwing surfaces as E_LIB — the adapter does not re-implement the verb's input validation.\n\nThe twelve tools mirror the felag-core library verbs: felag_lint, felag_fmt, felag_hash, felag_verify, felag_audit, felag_promote, felag_graduate, felag_render, felag_prime, felag_validate_author, felag_validate_excavate, felag_validate_prime. Eight have a CLI verb of the same stem; the four author-class validators (render and the three validate_*) expose felag-core library functions with no CLI counterpart. Most tools are pure pass-throughs whose result is the named felag-core function's return wrapped unchanged under {ok:true, result}; those are specced here only at the envelope boundary, never re-stated (their semantics are felag-core's). A pass-through success fixture therefore EMBEDS a concrete felag-core result by reference: that value is pinned by the core's own contract and is expected to move if the core's result legitimately evolves under it — the fixture asserts the adapter wraps it unchanged, not that the value is itself a c-mcp obligation.",
  },
  {
    record: "item",
    id: "it-mcp-resolve",
    title: "Spec-source resolution: inline-vs-path precedence",
    body:
      "Tools that operate on a spec accept the spec inline under `spec` (a SpecRecord array) and/or by path under `specDir` (a directory). The name `spec` is deliberate: `records` is reserved for the EVIDENCE channel (verify/audit take VerificationRecords, graduate takes JudgmentRecords) and would otherwise collide with the spec — so a single call may legitimately carry BOTH an inline `spec` (the contract) and a `records` array (the evidence), and they never contend. Resolution is deterministic: inline `spec` WINS when present — where PRESENT means `spec` is a JSON array (any other type is treated as absent and falls through) — and specDir is not consulted. Otherwise specDir is loaded from the filesystem snapshot by reading specDir + '/spec.jsonl' and specDir + '/fixtures.jsonl' — either file may be absent, and whichever are present have their records concatenated (parity with the CLI's loadSpecDir). If neither file is present in the snapshot, resolution fails with E_SPEC_NOT_FOUND. If neither `spec` nor `specDir` is supplied at all, resolution fails with E_NO_SPEC_SOURCE.\n\nThe filesystem is an explicit snapshot — a map from logical 'dir/file' path (joined with '/') to file content — passed to dispatch, NOT a live disk read. This makes path-loading a pure, fixturable function: a fixture carries its own in-memory filesystem. The real MCP server populates the snapshot by reading the requested specDir from disk before calling dispatch; that disk I/O is transport, excluded from this contract. The precedence rule (inline beats path) is the load-bearing decision: it lets an agent compose or test against an inline spec while the path remains the ergonomic default.",
  },
  {
    record: "item",
    id: "it-mcp-tools",
    title: "Adapter-shaped tool results",
    body:
      "Three tools return a result that is NOT a bare pass-through of a single core function — the adapter composes or reshapes, and that shaping is contract:\n\nfelag_lint returns {valid, errors, orphanFixtures}: the core lint result (valid, errors) plus orphanFixtures, the ascending set of fixture ids referenced by no criterion. The CLI emits this as a stderr warning; the adapter surfaces it in-band. An orphan is a warning, never a lint error — valid stays true.\n\nfelag_hash returns {hashes}, an array of {id, hash} for the FIXTURE records only (other record types are skipped), ascending by id, hash being felag-core's fixtureHash (CS9). An optional fixtureId narrows to one fixture. This is the CLI's hash iteration surfaced as structured data.\n\nfelag_fmt returns {canonical}, the canonical serialization of the input — given inline records, or given raw text it parses then re-serializes (the round-trip primitive). When BOTH records and text are present, records WINS and text is consulted only when records is absent — the same inline-structured-wins tiebreak as resolveSpec's spec-over-specDir. It is READ-ONLY: unlike the CLI's in-place fmt, the tool never writes a file. This is structural, not incidental — dispatch is handed no writer, so no tool can mutate the filesystem.\n\nThe adapter is thin: each tool delegates verb semantics to the felag-core library and adds only I/O resolution, result shaping, and error mapping. It never re-derives or alters a verb's result. (This thinness is a judgment seam, recorded descriptive — documented, never gated.)",
  },
];

// ---------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------

function crit(over: Partial<Criterion> & { id: string; itemId: string }): Criterion {
  return {
    record: "criterion",
    contractId: "c-mcp",
    type: "scenario",
    class: "behavioral",
    force: "MUST",
    state: "proposed",
    source: "forethought",
    fixtures: [],
    ...over,
  } as Criterion;
}

const criteria: Criterion[] = [
  // it-mcp-dispatch
  crit({
    id: "ac-mcp-envelope-ok",
    itemId: "it-mcp-dispatch",
    gherkin:
      "Given a valid call to any pass-through tool (render, verify, audit, promote, graduate, prime, validate_author, validate_excavate, validate_prime)\nWhen mcpDispatch routes it\nThen the envelope is {ok:true, result} and result is the named felag-core function's return wrapped unchanged — the adapter resolves I/O and wraps, it neither re-derives nor reshapes a pass-through result\nAnd the spec resolves from the `spec`/`specDir` channel while evidence (where the verb takes it) rides the `records` channel",
    fixtures: [
      "fx-mcp-envelope-render",
      "fx-mcp-envelope-verify",
      "fx-mcp-envelope-audit",
      "fx-mcp-envelope-promote",
      "fx-mcp-envelope-graduate",
      "fx-mcp-envelope-prime",
      "fx-mcp-envelope-validate-author",
      "fx-mcp-envelope-validate-excavate",
      "fx-mcp-envelope-validate-prime",
    ],
  }),
  crit({
    id: "ac-mcp-unknown-tool",
    itemId: "it-mcp-dispatch",
    gherkin:
      "Given a call naming a tool absent from the registry\nWhen mcpDispatch routes it\nThen the envelope is {ok:false, error:'E_UNKNOWN_TOOL'} with a non-empty detail, and nothing is thrown",
    fixtures: ["fx-mcp-unknown-tool"],
  }),
  crit({
    id: "ac-mcp-totality",
    itemId: "it-mcp-dispatch",
    gherkin:
      "Given a call whose input drives a felag-core function to throw (felag_fmt over unparseable text)\nWhen mcpDispatch routes it\nThen the throw is caught and mapped to {ok:false, error:'E_PARSE'} with a non-empty detail — dispatch never propagates the exception\nAnd any other non-mapped library throw maps to the E_LIB catch-all (residue: its triggers depend on felag-core's incidental throwing behavior, none contractually stable — see exclusions)",
    fixtures: ["fx-mcp-parse-error"],
  }),
  crit({
    id: "ac-mcp-bad-input",
    itemId: "it-mcp-dispatch",
    gherkin:
      "Given a tool call missing one of its REQUIRED inputs (verify with a spec but no implementation; fmt with neither records nor text; render with a spec but no audience; promote with a spec and transition but no asOf; render with an explicit null audience)\nWhen mcpDispatch routes it\nThen the envelope is {ok:false, error:'E_BAD_INPUT'} naming the missing input in detail — absence is a structural check the adapter makes without verb knowledge, a JSON null counts as absent, and E_BAD_INPUT precedes spec-source codes whenever a required input AND the spec source are both absent — for EVERY tool, whether its required input is a scalar (verify with no inputs), an object (promote with only asOf, missing transition), or the tool takes a spec plus one scalar (render or validate_prime with no inputs at all)\nAnd this is distinct from E_LIB (a present-but-invalid input the core rejects by throwing)",
    fixtures: [
      "fx-mcp-bad-input-verify",
      "fx-mcp-bad-input-fmt",
      "fx-mcp-bad-input-render",
      "fx-mcp-bad-input-promote",
      "fx-mcp-bad-input-null",
      "fx-mcp-bad-input-precedence",
      "fx-mcp-bad-input-prec-render",
      "fx-mcp-bad-input-prec-promote",
      "fx-mcp-bad-input-prec-graduate",
      "fx-mcp-bad-input-prec-validate-prime",
    ],
  }),

  // it-mcp-resolve
  crit({
    id: "ac-mcp-inline-wins",
    itemId: "it-mcp-resolve",
    gherkin:
      "Given a call carrying BOTH an inline spec (valid) and a specDir whose snapshot files are broken\nWhen the tool resolves its spec\nThen the inline spec is used and the specDir is not consulted — the result reflects the inline spec, not a parse error\nAnd given an inline `spec` that is NOT a JSON array (treated as absent) alongside a valid specDir, resolution falls through to the path",
    fixtures: ["fx-mcp-inline-wins", "fx-mcp-spec-nonarray"],
  }),
  crit({
    id: "ac-mcp-path-load",
    itemId: "it-mcp-resolve",
    gherkin:
      "Given a call carrying only a specDir, whose snapshot holds spec.jsonl and fixtures.jsonl\nWhen the tool resolves its spec\nThen both files are read and their records concatenated (loadSpecDir parity) and the tool runs against the merged spec",
    fixtures: ["fx-mcp-path-load"],
  }),
  crit({
    id: "ac-mcp-no-source",
    itemId: "it-mcp-resolve",
    gherkin:
      "Given a spec-operating call carrying neither records nor specDir\nWhen the tool resolves its spec\nThen the envelope is {ok:false, error:'E_NO_SPEC_SOURCE'}",
    fixtures: ["fx-mcp-no-source"],
  }),
  crit({
    id: "ac-mcp-spec-not-found",
    itemId: "it-mcp-resolve",
    gherkin:
      "Given a call carrying a specDir whose interchange files are absent from the snapshot\nWhen the tool resolves its spec\nThen the envelope is {ok:false, error:'E_SPEC_NOT_FOUND'}",
    fixtures: ["fx-mcp-spec-not-found"],
  }),
  crit({
    id: "ac-mcp-path-parse-error",
    itemId: "it-mcp-resolve",
    gherkin:
      "Given a call carrying only a specDir whose snapshot spec.jsonl is present but unparseable\nWhen the tool resolves its spec\nThen the envelope is {ok:false, error:'E_PARSE'} — the snapshot-file parse site, distinct from fmt's text parse, also maps to E_PARSE rather than swallowing a partial load",
    fixtures: ["fx-mcp-path-parse-error"],
  }),
  crit({
    id: "ac-mcp-channel-isolation",
    itemId: "it-mcp-resolve",
    gherkin:
      "Given felag_verify carrying BOTH an inline spec (the contract) and a records array (passing VerificationRecords, the evidence)\nWhen the tool runs\nThen the spec resolves from `spec` and the records are consumed as EVIDENCE, not as spec — the conformance report reflects the evidence against the inline contract\nAnd an implementation that read the spec from `records` (as the CLI's verify reads a records.jsonl positional) would misverify here",
    fixtures: ["fx-mcp-channel-isolation"],
  }),

  // it-mcp-tools
  crit({
    id: "ac-mcp-lint-orphans",
    itemId: "it-mcp-tools",
    gherkin:
      "Given felag_lint over a lint-valid spec that contains TWO fixtures referenced by no criterion, supplied out of id order\nWhen the tool runs\nThen the result is {valid:true, errors:[], orphanFixtures:[both ids, ascending]} — the orphans are warnings surfaced in-band (valid stays true), and the ascending order is discriminated\nAnd given a lint-INVALID spec (a duplicate criterion id) the core errors flow through UNCHANGED under {valid:false, errors:[...]} while orphanFixtures is still computed — the adapter never short-circuits the orphan scan on an invalid spec",
    fixtures: ["fx-mcp-lint-orphans", "fx-mcp-lint-errors"],
  }),
  crit({
    id: "ac-mcp-hash-shape",
    itemId: "it-mcp-tools",
    gherkin:
      "Given felag_hash over a spec containing non-fixture records and two fixtures whose ids are NOT in input order\nWhen the tool runs\nThen the result is {hashes:[{id, hash}]} for the fixture records only, ascending by id (the sort is discriminated), hash being felag-core's fixtureHash\nAnd given an optional fixtureId, only that fixture's hash is returned",
    fixtures: ["fx-mcp-hash-shape", "fx-mcp-hash-narrow"],
  }),
  crit({
    id: "ac-mcp-fmt-roundtrip",
    itemId: "it-mcp-tools",
    gherkin:
      "Given felag_fmt over non-canonical raw text\nWhen the tool runs\nThen the result is {canonical} carrying the canonical serialization (parse then serialize) and no file is written\nAnd given BOTH records and text, records wins (the inline-structured-wins tiebreak) and the text is not consulted",
    fixtures: ["fx-mcp-fmt-roundtrip", "fx-mcp-fmt-precedence"],
  }),
  crit({
    id: "ac-mcp-adapter-thinness",
    itemId: "it-mcp-tools",
    class: "judgment",
    state: "descriptive",
    force: "SHOULD",
    gherkin:
      "Each tool delegates verb semantics to the felag-core library and adds only I/O resolution, result shaping, and error mapping; it never re-implements, re-derives, or alters a verb's result. Recorded descriptive — a documented seam that never gates.",
    fixtures: [],
  }),
];

// ---------------------------------------------------------------------------
// Fixtures — a shared lint-valid mini spec, plus the dispatch fixtures.
// Mechanical values (render output, fixtureHash, canonical strings) computed
// via the lib; envelope shapes and error codes authored by hand.
// ---------------------------------------------------------------------------

const miniPreamble: Preamble = {
  record: "preamble",
  name: "mini",
  conformanceVersion: "1.0.0",
  goals: ["exercise the felag-mcp fixtures"],
  contracts: [{ id: "c1", description: "mini contract" }],
  exclusions: [],
  implementers: [{ name: "impl-a", roles: ["repo-owner"] }],
};
const miniItem: Item = { record: "item", id: "it1", title: "mini item", body: "mini body" };
const miniCriterion: Criterion = {
  record: "criterion",
  id: "ac1",
  itemId: "it1",
  contractId: "c1",
  type: "scenario",
  class: "behavioral",
  force: "MUST",
  state: "active",
  source: "forethought",
  gherkin: "Given x\nWhen y\nThen z",
  fixtures: ["fx1"],
};
const miniFixture: Fixture = {
  record: "fixture",
  id: "fx1",
  contractId: "c1",
  description: "mini fixture",
  format: "json",
  input: { x: 1 },
  expected: { y: 2 },
};
const miniSpec: SpecRecord[] = [miniPreamble, miniItem, miniCriterion, miniFixture];

// A passing VerificationRecord for ac1 — the EVIDENCE channel payload.
const passRecord: VerificationRecord = {
  criterionId: "ac1",
  fixtureId: "fx1",
  fixtureHash: fixtureHash(miniFixture),
  implementation: "impl-a",
  implementationVersion: "1.0.0",
  conformanceVersion: "1.0.0",
  verdict: "pass",
  evidence: "runner output ref #1",
  runner: "ci",
  at: "2026-01-01T00:00:00Z",
  attribution: "ci@example run:1",
};

// A second fixture for hash ordering (fx2 supplied BEFORE fx1 in input).
const miniFixture2: Fixture = {
  record: "fixture",
  id: "fx2",
  contractId: "c1",
  description: "second mini fixture",
  format: "json",
  input: { x: 2 },
  expected: { y: 3 },
};

const orphanFixture: Fixture = {
  record: "fixture",
  id: "fx-orphan-a",
  contractId: "c1",
  description: "referenced by no criterion",
  format: "json",
  input: {},
  expected: {},
};
const orphanFixture2: Fixture = {
  record: "fixture",
  id: "fx-orphan-b",
  contractId: "c1",
  description: "also referenced by no criterion",
  format: "json",
  input: {},
  expected: {},
};

const fixtures: Fixture[] = [];
function fx(
  id: string,
  description: string,
  input: unknown,
  expected: unknown,
) {
  fixtures.push({
    record: "fixture",
    id,
    contractId: "c-mcp",
    description,
    format: "felag/mcp-dispatch@0",
    input,
    expected,
  });
}

const ASOF = "2026-01-01T00:00:00Z";
const verifyInput = { asOf: ASOF, implementation: "impl-a", records: [], spec: miniSpec, waivers: [] };
const promoteTransition = {
  criterionId: "ac1",
  to: "active" as const,
  requestedAt: ASOF,
  requestedBy: "impl-a",
  acknowledgments: [],
};
const excavateSpec: SpecRecord[] = [miniPreamble, miniItem];

// --- ac-mcp-envelope-ok: one success fixture per pass-through tool. Each
// EMBEDS the named core function's result (computed via the lib) to assert the
// adapter wraps it unchanged under {ok:true, result}; the embedded value is
// pinned by felag-core's contract by reference (it-mcp-dispatch). ---
fx(
  "fx-mcp-envelope-render",
  "felag_render (developer audience) wraps renderInventory's return unchanged under {ok:true, result}. An impl that added a layer or dropped the ok discriminant diverges.",
  { call: { tool: "felag_render", input: { spec: miniSpec, audience: "developer" } } },
  { ok: true, result: renderInventory({ spec: miniSpec, audience: "developer" }) },
);
fx(
  "fx-mcp-envelope-verify",
  "felag_verify wraps verify's ConformanceReport unchanged. Spec rides the spec channel, evidence the records channel (here empty). An impl that mis-wired the evidence channel diverges.",
  { call: { tool: "felag_verify", input: verifyInput } },
  { ok: true, result: verify({ asOf: ASOF, implementation: "impl-a", records: [], spec: miniSpec, waivers: [] }) },
);
fx(
  "fx-mcp-envelope-audit",
  "felag_audit wraps audit's {report, proposals} unchanged — the pure coverage projection, no work layer attached (statefulness excluded).",
  { call: { tool: "felag_audit", input: verifyInput } },
  { ok: true, result: audit({ asOf: ASOF, implementation: "impl-a", records: [], spec: miniSpec, waivers: [] }) },
);
fx(
  "fx-mcp-envelope-promote",
  "felag_promote wraps promote's PromotionResult unchanged (here a refusal: ac1 is active, not proposed). The transition rides its own input field; asOf is required (no server clock in the pure function).",
  { call: { tool: "felag_promote", input: { spec: miniSpec, transition: promoteTransition, asOf: ASOF } } },
  { ok: true, result: promote({ asOf: ASOF, spec: miniSpec, transition: promoteTransition }) },
);
fx(
  "fx-mcp-envelope-graduate",
  "felag_graduate wraps graduate's GraduationResult unchanged (here a guard: ac1 is behavioral, not a graduatable judgment criterion). criterionId and implementation are required.",
  { call: { tool: "felag_graduate", input: { spec: miniSpec, criterionId: "ac1", implementation: "impl-a", records: [] } } },
  { ok: true, result: graduate({ criterionId: "ac1", implementation: "impl-a", records: [], spec: miniSpec }) },
);
fx(
  "fx-mcp-envelope-prime",
  "felag_prime wraps emitPrime's markdown STRING unchanged as result (not double-JSON-encoded). The result is a bare string, the one pass-through whose payload is not an object.",
  { call: { tool: "felag_prime", input: { spec: miniSpec } } },
  { ok: true, result: emitPrime(miniSpec) },
);
fx(
  "fx-mcp-envelope-validate-author",
  "felag_validate_author wraps validateAuthorOutput's LintResult unchanged (new:['ac1'] over a valid mini spec, ac1 source forethought -> valid). The non-empty `new` exercises the field routing — an adapter that dropped or misrouted `new` would not be caught by an empty list.",
  { call: { tool: "felag_validate_author", input: { spec: miniSpec, new: ["ac1"] } } },
  { ok: true, result: validateAuthorOutput({ spec: miniSpec, new: ["ac1"] }) },
);
fx(
  "fx-mcp-envelope-validate-excavate",
  "felag_validate_excavate wraps validateExcavateOutput's LintResult unchanged (scoped, no criteria to check -> valid). scope rides its own field.",
  { call: { tool: "felag_validate_excavate", input: { spec: excavateSpec, scope: { contracts: ["c1"] } } } },
  { ok: true, result: validateExcavateOutput({ spec: excavateSpec, scope: { contracts: ["c1"] } }) },
);
fx(
  "fx-mcp-envelope-validate-prime",
  "felag_validate_prime wraps validatePrimeOutput's LintResult unchanged (no c-author protocol items -> valid). output rides its own field.",
  { call: { tool: "felag_validate_prime", input: { spec: miniSpec, output: "" } } },
  { ok: true, result: validatePrimeOutput({ spec: miniSpec, output: "" }) },
);

// --- ac-mcp-unknown-tool ---
fx(
  "fx-mcp-unknown-tool",
  "A call naming a tool absent from the twelve-tool registry returns {ok:false, error:'E_UNKNOWN_TOOL'} and does not throw. detail is a non-empty string whose wording is non-normative.",
  { call: { tool: "felag_nonesuch", input: {} } },
  { ok: false, error: "E_UNKNOWN_TOOL" },
);

// --- ac-mcp-totality: a library throw (unparseable fmt text) maps to E_PARSE ---
fx(
  "fx-mcp-parse-error",
  "felag_fmt over unparseable raw text drives the parser to throw; dispatch catches it and returns {ok:false, error:'E_PARSE'}. The exception never reaches the transport.",
  { call: { tool: "felag_fmt", input: { text: "{ this is not valid json" } } },
  { ok: false, error: "E_PARSE" },
);

// --- ac-mcp-bad-input: a REQUIRED input absent -> E_BAD_INPUT (the sixth code) ---
fx(
  "fx-mcp-bad-input-verify",
  "felag_verify with a spec and asOf but NO implementation returns {ok:false, error:'E_BAD_INPUT'}. A required input is structurally absent — the adapter catches it without verb knowledge, distinct from E_LIB.",
  { call: { tool: "felag_verify", input: { spec: miniSpec, asOf: ASOF, records: [] } } },
  { ok: false, error: "E_BAD_INPUT" },
);
fx(
  "fx-mcp-bad-input-fmt",
  "felag_fmt with neither records nor text returns {ok:false, error:'E_BAD_INPUT'} — fmt's own required-input check.",
  { call: { tool: "felag_fmt", input: {} } },
  { ok: false, error: "E_BAD_INPUT" },
);
fx(
  "fx-mcp-bad-input-render",
  "felag_render with a spec but no audience returns {ok:false, error:'E_BAD_INPUT'} — absence of a required input, NOT E_LIB (which is reserved for a present-but-invalid input the core rejects by throwing).",
  { call: { tool: "felag_render", input: { spec: miniSpec } } },
  { ok: false, error: "E_BAD_INPUT" },
);
fx(
  "fx-mcp-bad-input-promote",
  "felag_promote with a spec and transition but NO asOf returns {ok:false, error:'E_BAD_INPUT'}. asOf is required (the pure function has no server clock) — a stranger omitting this check would forward asOf:undefined to promote and get ok:true/E_SCHEMA instead.",
  { call: { tool: "felag_promote", input: { spec: miniSpec, transition: promoteTransition } } },
  { ok: false, error: "E_BAD_INPUT" },
);
fx(
  "fx-mcp-bad-input-null",
  "felag_render with an explicit null audience returns {ok:false, error:'E_BAD_INPUT'} — a JSON null counts as absent for a required input; a present null is never forwarded to the verb (which would throw on undefined and yield E_LIB).",
  { call: { tool: "felag_render", input: { spec: miniSpec, audience: null } } },
  { ok: false, error: "E_BAD_INPUT" },
);
fx(
  "fx-mcp-bad-input-precedence",
  "felag_verify with NO inputs at all (neither the required scalars nor a spec source) returns {ok:false, error:'E_BAD_INPUT'}, not E_NO_SPEC_SOURCE — required-input presence is checked before spec-source resolution, so E_BAD_INPUT wins when both are absent.",
  { call: { tool: "felag_verify", input: {} } },
  { ok: false, error: "E_BAD_INPUT" },
);
fx(
  "fx-mcp-bad-input-prec-render",
  "felag_render with NO inputs returns {ok:false, error:'E_BAD_INPUT'} on the absent audience, NOT E_NO_SPEC_SOURCE — the ordering rule binds render (whose required input is a scalar checked before the spec resolves). An impl that inlined audience into the call AFTER resolving the spec would return E_NO_SPEC_SOURCE here.",
  { call: { tool: "felag_render", input: {} } },
  { ok: false, error: "E_BAD_INPUT" },
);
fx(
  "fx-mcp-bad-input-prec-promote",
  "felag_promote with ONLY asOf (transition and spec both absent) returns {ok:false, error:'E_BAD_INPUT'} on the absent transition, NOT E_NO_SPEC_SOURCE — the ordering rule binds even when the required input is an OBJECT (transition), not a scalar.",
  { call: { tool: "felag_promote", input: { asOf: ASOF } } },
  { ok: false, error: "E_BAD_INPUT" },
);
fx(
  "fx-mcp-bad-input-prec-validate-prime",
  "felag_validate_prime with NO inputs returns {ok:false, error:'E_BAD_INPUT'} on the absent output, NOT E_NO_SPEC_SOURCE — the ordering rule binds validate_prime too.",
  { call: { tool: "felag_validate_prime", input: {} } },
  { ok: false, error: "E_BAD_INPUT" },
);
fx(
  "fx-mcp-bad-input-prec-graduate",
  "felag_graduate with NO inputs returns {ok:false, error:'E_BAD_INPUT'} on the absent criterionId/implementation, NOT E_NO_SPEC_SOURCE — graduate has its own handler (two required inputs) and the ordering rule binds it too.",
  { call: { tool: "felag_graduate", input: {} } },
  { ok: false, error: "E_BAD_INPUT" },
);

// --- ac-mcp-inline-wins: inline spec used, broken specDir ignored ---
fx(
  "fx-mcp-inline-wins",
  "A felag_lint call carrying BOTH an inline spec (valid) and a specDir whose snapshot spec.jsonl is broken JSON: inline wins, the specDir is never read, lint reports the inline spec valid. An impl preferring the path would return E_PARSE — the discrimination this pins.",
  {
    call: { tool: "felag_lint", input: { spec: miniSpec, specDir: "spec/decoy" } },
    fs: { "spec/decoy/spec.jsonl": "{ broken interchange" },
  },
  { ok: true, result: { valid: true, errors: [], orphanFixtures: [] } },
);
fx(
  "fx-mcp-spec-nonarray",
  "A felag_lint call whose inline `spec` is a string (not a JSON array) alongside a valid specDir: the non-array spec is treated as ABSENT and resolution falls through to the path, which loads and lints valid. An impl treating any truthy `spec` as present would mis-handle this.",
  {
    call: { tool: "felag_lint", input: { spec: "not an array", specDir: "spec/mini" } },
    fs: {
      "spec/mini/spec.jsonl": serialize([miniPreamble, miniItem, miniCriterion]),
      "spec/mini/fixtures.jsonl": serialize([miniFixture]),
    },
  },
  { ok: true, result: { valid: true, errors: [], orphanFixtures: [] } },
);

// --- ac-mcp-channel-isolation: spec and records are distinct channels ---
fx(
  "fx-mcp-channel-isolation",
  "felag_verify carrying BOTH an inline spec (contract) and a records array (one passing VerificationRecord for ac1, the evidence): the spec resolves from `spec` and the record is consumed as EVIDENCE, yielding a conforming report. An impl reading the spec from `records` (as the CLI's verify reads a records.jsonl positional) would misverify — the spec's own load-bearing channel decision, finally pinned.",
  { call: { tool: "felag_verify", input: { spec: miniSpec, records: [passRecord], implementation: "impl-a", asOf: ASOF, waivers: [] } } },
  { ok: true, result: verify({ asOf: ASOF, implementation: "impl-a", records: [passRecord], spec: miniSpec, waivers: [] }) },
);

// --- ac-mcp-path-load: specDir read from the snapshot, both files merged ---
fx(
  "fx-mcp-path-load",
  "A felag_lint call carrying only specDir, whose snapshot holds spec.jsonl (preamble+item+criterion) and fixtures.jsonl (the fixture): both are read and concatenated, lint runs against the merged spec — loadSpecDir parity. An impl reading only one file would report E_MISSING_FIXTURES or an orphan.",
  {
    call: { tool: "felag_lint", input: { specDir: "spec/mini" } },
    fs: {
      "spec/mini/spec.jsonl": serialize([miniPreamble, miniItem, miniCriterion]),
      "spec/mini/fixtures.jsonl": serialize([miniFixture]),
    },
  },
  { ok: true, result: { valid: true, errors: [], orphanFixtures: [] } },
);

// --- ac-mcp-path-parse-error: a malformed snapshot file -> E_PARSE ---
fx(
  "fx-mcp-path-parse-error",
  "A felag_lint call with only specDir, whose snapshot spec.jsonl is present but unparseable, returns {ok:false, error:'E_PARSE'} — the snapshot-file parse site (distinct from fmt's text parse) maps to E_PARSE rather than swallowing a partial load.",
  {
    call: { tool: "felag_lint", input: { specDir: "spec/bad" } },
    fs: { "spec/bad/spec.jsonl": "{ not parseable" },
  },
  { ok: false, error: "E_PARSE" },
);

// --- ac-mcp-no-source / ac-mcp-spec-not-found ---
fx(
  "fx-mcp-no-source",
  "A spec-operating call (felag_lint) carrying neither spec nor specDir returns {ok:false, error:'E_NO_SPEC_SOURCE'}.",
  { call: { tool: "felag_lint", input: {} } },
  { ok: false, error: "E_NO_SPEC_SOURCE" },
);
fx(
  "fx-mcp-spec-not-found",
  "A felag_lint call naming a specDir whose interchange files are absent from the snapshot returns {ok:false, error:'E_SPEC_NOT_FOUND'} — distinct from E_NO_SPEC_SOURCE (a path WAS given; nothing was there).",
  { call: { tool: "felag_lint", input: { specDir: "spec/absent" } }, fs: {} },
  { ok: false, error: "E_SPEC_NOT_FOUND" },
);

// --- ac-mcp-lint-orphans: TWO orphans, out of order -> ascending, valid stays true ---
fx(
  "fx-mcp-lint-orphans",
  "felag_lint over a lint-valid spec carrying TWO fixtures referenced by no criterion, supplied out of id order (fx-orphan-b before fx-orphan-a): {valid:true, errors:[], orphanFixtures:['fx-orphan-a','fx-orphan-b']}. Orphans are in-band warnings (valid stays true) and the ascending order is discriminated — an impl that never sorts, or promoted an orphan to a lint error, diverges.",
  { call: { tool: "felag_lint", input: { spec: [...miniSpec, orphanFixture2, orphanFixture] } } },
  { ok: true, result: { valid: true, errors: [], orphanFixtures: ["fx-orphan-a", "fx-orphan-b"] } },
);
{
  // A lint-INVALID spec (ac1 duplicated): the core's errors must flow through
  // the envelope unchanged AND orphanFixtures is still computed. felag_lint
  // returns ok:true (the tool ran) with result.valid:false.
  const dupSpec: SpecRecord[] = [miniPreamble, miniItem, miniCriterion, { ...miniCriterion }, miniFixture, orphanFixture];
  const dupLint = lint(dupSpec);
  fx(
    "fx-mcp-lint-errors",
    "felag_lint over a lint-INVALID spec (a duplicate criterion id) returns ok:true (the tool ran) with result {valid:false, errors:[core errors UNCHANGED], orphanFixtures:[still computed]}. An adapter that mangled errors, or short-circuited the orphan scan when valid:false, diverges. The error code is felag-core's; the adapter only carries it.",
    { call: { tool: "felag_lint", input: { spec: dupSpec } } },
    { ok: true, result: { valid: dupLint.valid, errors: dupLint.errors, orphanFixtures: ["fx-orphan-a"] } },
  );
}

// --- ac-mcp-hash-shape: fixtures only, two out of order -> ascending; + fixtureId narrowing ---
fx(
  "fx-mcp-hash-shape",
  "felag_hash over a spec with non-fixture records and TWO fixtures supplied out of id order (fx2 before fx1) returns {hashes:[{id,hash}]} for the FIXTURE records only, ASCENDING by id — non-fixture records skipped, the sort discriminated. hash is felag-core's fixtureHash (CS9).",
  { call: { tool: "felag_hash", input: { spec: [miniPreamble, miniItem, miniCriterion, miniFixture2, miniFixture] } } },
  { ok: true, result: { hashes: [{ id: "fx1", hash: fixtureHash(miniFixture) }, { id: "fx2", hash: fixtureHash(miniFixture2) }] } },
);
fx(
  "fx-mcp-hash-narrow",
  "felag_hash with an optional fixtureId narrows to that single fixture: only fx2's hash is returned, fx1 omitted. The narrowing selector is a real adapter feature.",
  { call: { tool: "felag_hash", input: { spec: [miniPreamble, miniItem, miniCriterion, miniFixture2, miniFixture], fixtureId: "fx2" } } },
  { ok: true, result: { hashes: [{ id: "fx2", hash: fixtureHash(miniFixture2) }] } },
);

// --- ac-mcp-fmt-roundtrip ---
{
  const nonCanonical = '{"id":"it1","record":"item","title":"t","body":"b"}';
  fx(
    "fx-mcp-fmt-roundtrip",
    "felag_fmt over a non-canonical interchange line (keys out of CS4 order) returns {canonical} carrying the canonical serialization — record first, then id, then ascending keys, trailing LF. No file is written (dispatch holds no writer). The parse-then-serialize round-trip surfaced as a tool.",
    { call: { tool: "felag_fmt", input: { text: nonCanonical } } },
    { ok: true, result: { canonical: serialize(parse(nonCanonical)) } },
  );
  fx(
    "fx-mcp-fmt-precedence",
    "felag_fmt given BOTH records and text where the text is UNPARSEABLE: records wins, the text is never consulted, and the result is the canonical serialization of the records. An impl that consulted text first (or preferred it) would return E_PARSE here — the records-over-text tiebreak, symmetric with spec-over-specDir.",
    { call: { tool: "felag_fmt", input: { records: [miniItem], text: "{ would not parse" } } },
    { ok: true, result: { canonical: serialize([miniItem]) } },
  );
}

// ---------------------------------------------------------------------------
// Validate and write.
// ---------------------------------------------------------------------------

const sortedFixtures = sortFixtures(fixtures);
const spec: SpecRecord[] = [preamble, ...items, ...criteria];
const all: SpecRecord[] = [...spec, ...sortedFixtures];

const lintResult = lint(all);
if (!lintResult.valid) {
  console.error(JSON.stringify(lintResult, null, 2));
  throw new Error("lint failed");
}
const newCriteria = criteria.map((c) => c.id);
const authorResult = validateAuthorOutput({
  spec: all,
  // The descriptive seam is forethought too; validateAuthorOutput's A3 only
  // checks that newly-authored ids carry source forethought, which they do.
  new: newCriteria,
});
if (!authorResult.valid) {
  console.error(JSON.stringify(authorResult, null, 2));
  throw new Error("validateAuthorOutput failed");
}

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "spec.jsonl"), serialize(spec));
writeFileSync(join(dir, "fixtures.jsonl"), serialize(sortedFixtures));
console.log(
  `spec.jsonl: ${spec.length} records; fixtures.jsonl: ${sortedFixtures.length} records`,
);
console.log("validateAuthorOutput: valid; lint: valid");
