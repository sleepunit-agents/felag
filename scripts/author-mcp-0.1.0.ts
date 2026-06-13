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
import { renderInventory } from "../src/author.js";
import { validateAuthorOutput } from "../src/author.js";
import type {
  Criterion,
  Fixture,
  Item,
  Preamble,
  SpecRecord,
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
    "MCP adapter residue at 0.1.0: the E_LIB catch-all maps any non-mapped library throw, but its canonical trigger — serialize's CS6 refusal of a non-finite number — cannot be carried in a JSON fixture (the corpus cannot encode the value whose refusal it would pin), exactly as felag-core's CS6 writer refusal is unfixturable. The obligation rides on prose and the dispatch implementation, not a fixture; the fixturable totality case is E_PARSE.",
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
      "Every MCP tool call resolves through a single pure function, mcpDispatch(call, fs), where call is {tool, input} and fs is a filesystem snapshot (below). It returns a result envelope: a discriminated union of {ok:true, result} on success and {ok:false, error, detail} on failure. result is the tool's payload (the verb's result, possibly adapter-shaped); error is a stable machine code (E_*); detail is a required non-empty human-readable string whose WORDING is non-normative but whose presence and type are normative.\n\nDispatch is TOTAL: it never throws and never propagates an exception to the transport. A tool name absent from the registry returns E_UNKNOWN_TOOL. A thrown felag-core library error is caught and mapped — unparseable interchange to E_PARSE, any other library throw to the catch-all E_LIB — so a model never receives a crashed server instead of an answer. The error CODE is the divergence point a second implementation must match; this totality is the verify-is-a-ledger stance (felag never crashes the caller) carried to the tool layer.\n\nThe twelve tools mirror the CLI verbs one-to-one: felag_lint, felag_fmt, felag_hash, felag_verify, felag_audit, felag_promote, felag_graduate, felag_render, felag_prime, felag_validate_author, felag_validate_excavate, felag_validate_prime. Most are pure pass-throughs whose result is the named felag-core function's return wrapped unchanged under {ok:true, result}; those are specced here only at the envelope boundary, never re-stated (their semantics are felag-core's).",
  },
  {
    record: "item",
    id: "it-mcp-resolve",
    title: "Spec-source resolution: inline-vs-path precedence",
    body:
      "Tools that operate on a spec accept the spec inline under `spec` (a SpecRecord array) and/or by path under `specDir` (a directory). The name `spec` is deliberate: `records` is reserved for the EVIDENCE channel (verify/audit take VerificationRecords, graduate takes JudgmentRecords) and would otherwise collide with the spec. Resolution is deterministic: inline `spec` WINS when present, and specDir is not consulted. Otherwise specDir is loaded from the filesystem snapshot by reading specDir + '/spec.jsonl' and specDir + '/fixtures.jsonl' — either file may be absent, and whichever are present have their records concatenated (parity with the CLI's loadSpecDir). If neither file is present in the snapshot, resolution fails with E_SPEC_NOT_FOUND. If neither `spec` nor `specDir` is supplied at all, resolution fails with E_NO_SPEC_SOURCE.\n\nThe filesystem is an explicit snapshot — a map from logical 'dir/file' path (joined with '/') to file content — passed to dispatch, NOT a live disk read. This makes path-loading a pure, fixturable function: a fixture carries its own in-memory filesystem. The real MCP server populates the snapshot by reading the requested specDir from disk before calling dispatch; that disk I/O is transport, excluded from this contract. The precedence rule (inline beats path) is the load-bearing decision: it lets an agent compose or test against an inline spec while the path remains the ergonomic default.",
  },
  {
    record: "item",
    id: "it-mcp-tools",
    title: "Adapter-shaped tool results",
    body:
      "Three tools return a result that is NOT a bare pass-through of a single core function — the adapter composes or reshapes, and that shaping is contract:\n\nfelag_lint returns {valid, errors, orphanFixtures}: the core lint result (valid, errors) plus orphanFixtures, the ascending set of fixture ids referenced by no criterion. The CLI emits this as a stderr warning; the adapter surfaces it in-band. An orphan is a warning, never a lint error — valid stays true.\n\nfelag_hash returns {hashes}, an array of {id, hash} for the FIXTURE records only (other record types are skipped), ascending by id, hash being felag-core's fixtureHash (CS9). An optional fixtureId narrows to one fixture. This is the CLI's hash iteration surfaced as structured data.\n\nfelag_fmt returns {canonical}, the canonical serialization of the input — given inline records, or given raw text it parses then re-serializes (the round-trip primitive). It is READ-ONLY: unlike the CLI's in-place fmt, the tool never writes a file. This is structural, not incidental — dispatch is handed no writer, so no tool can mutate the filesystem.\n\nThe adapter is thin: each tool delegates verb semantics to the felag-core library and adds only I/O resolution, result shaping, and error mapping. It never re-derives or alters a verb's result. (This thinness is a judgment seam, recorded descriptive — documented, never gated.)",
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
      "Given a valid call to a pass-through tool (felag_render over an inline spec)\nWhen mcpDispatch routes it\nThen the envelope is {ok:true, result} and result is the felag-core function's return wrapped unchanged",
    fixtures: ["fx-mcp-envelope-ok"],
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
      "Given a call whose input drives a felag-core function to throw (felag_fmt over unparseable text)\nWhen mcpDispatch routes it\nThen the throw is caught and mapped to {ok:false, error:'E_PARSE'} with a non-empty detail — dispatch never propagates the exception\nAnd any other non-mapped library throw maps to the E_LIB catch-all (residue: its canonical trigger, a non-finite numeral, is unfixturable in JSON)",
    fixtures: ["fx-mcp-parse-error"],
  }),

  // it-mcp-resolve
  crit({
    id: "ac-mcp-inline-wins",
    itemId: "it-mcp-resolve",
    gherkin:
      "Given a call carrying BOTH inline records (a valid spec) and a specDir whose snapshot files are broken\nWhen the tool resolves its spec\nThen the inline records are used and the specDir is not consulted — the result reflects the inline spec, not a parse error",
    fixtures: ["fx-mcp-inline-wins"],
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

  // it-mcp-tools
  crit({
    id: "ac-mcp-lint-orphans",
    itemId: "it-mcp-tools",
    gherkin:
      "Given felag_lint over a lint-valid spec that contains a fixture referenced by no criterion\nWhen the tool runs\nThen the result is {valid:true, errors:[], orphanFixtures:[the orphan id]} — the orphan is a warning surfaced in-band, never a lint error",
    fixtures: ["fx-mcp-lint-orphans"],
  }),
  crit({
    id: "ac-mcp-hash-shape",
    itemId: "it-mcp-tools",
    gherkin:
      "Given felag_hash over a spec containing non-fixture records and one fixture\nWhen the tool runs\nThen the result is {hashes:[{id, hash}]} for the fixture records only, ascending by id, hash being felag-core's fixtureHash",
    fixtures: ["fx-mcp-hash-shape"],
  }),
  crit({
    id: "ac-mcp-fmt-roundtrip",
    itemId: "it-mcp-tools",
    gherkin:
      "Given felag_fmt over non-canonical raw text\nWhen the tool runs\nThen the result is {canonical} carrying the canonical serialization (parse then serialize) and no file is written",
    fixtures: ["fx-mcp-fmt-roundtrip"],
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

const orphanFixture: Fixture = {
  record: "fixture",
  id: "fx-orphan",
  contractId: "c1",
  description: "referenced by no criterion",
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

// 1. envelope success — pass-through felag_render, result is the core return verbatim.
fx(
  "fx-mcp-envelope-ok",
  "A valid pass-through call (felag_render, developer audience) returns {ok:true, result} where result is renderInventory's return wrapped unchanged. An implementation that wrapped the result in an extra layer, or omitted the ok discriminant, would diverge here.",
  { call: { tool: "felag_render", input: { spec: miniSpec, audience: "developer" } } },
  { ok: true, result: renderInventory({ spec: miniSpec, audience: "developer" }) },
);

// 2. unknown tool — E_UNKNOWN_TOOL (detail compared only for presence+type).
fx(
  "fx-mcp-unknown-tool",
  "A call naming a tool absent from the twelve-tool registry returns {ok:false, error:'E_UNKNOWN_TOOL'} and does not throw. detail is a non-empty string whose wording is non-normative.",
  { call: { tool: "felag_nonesuch", input: {} } },
  { ok: false, error: "E_UNKNOWN_TOOL" },
);

// 3. totality — a library throw (unparseable text) maps to E_PARSE, never propagates.
fx(
  "fx-mcp-parse-error",
  "felag_fmt over unparseable raw text drives the parser to throw; dispatch catches it and returns {ok:false, error:'E_PARSE'}. The exception never reaches the transport. (E_LIB, the catch-all for any other library throw, is unfixturable in JSON — see the 0.1.0 residue exclusion.)",
  { call: { tool: "felag_fmt", input: { text: "{ this is not valid json" } } },
  { ok: false, error: "E_PARSE" },
);

// 4. inline wins — inline records used, broken specDir ignored.
fx(
  "fx-mcp-inline-wins",
  "A felag_lint call carrying BOTH an inline spec (valid) and a specDir whose snapshot spec.jsonl is broken JSON: inline wins, the specDir is never read, and lint reports the inline spec valid. An implementation that preferred the path would return E_PARSE instead — the discrimination this fixture pins.",
  {
    call: { tool: "felag_lint", input: { spec: miniSpec, specDir: "spec/decoy" } },
    fs: { "spec/decoy/spec.jsonl": "{ broken interchange" },
  },
  { ok: true, result: { valid: true, errors: [], orphanFixtures: [] } },
);

// 5. path load — specDir read from the snapshot, both files merged.
fx(
  "fx-mcp-path-load",
  "A felag_lint call carrying only specDir, whose snapshot holds spec.jsonl (preamble+item+criterion) and fixtures.jsonl (the fixture): both are read and concatenated, and lint runs against the merged spec — loadSpecDir parity. An implementation reading only one of the two files would report E_MISSING_FIXTURES or an orphan.",
  {
    call: { tool: "felag_lint", input: { specDir: "spec/mini" } },
    fs: {
      "spec/mini/spec.jsonl": serialize([miniPreamble, miniItem, miniCriterion]),
      "spec/mini/fixtures.jsonl": serialize([miniFixture]),
    },
  },
  { ok: true, result: { valid: true, errors: [], orphanFixtures: [] } },
);

// 6. no source — neither records nor specDir.
fx(
  "fx-mcp-no-source",
  "A spec-operating call (felag_lint) carrying neither records nor specDir returns {ok:false, error:'E_NO_SPEC_SOURCE'}.",
  { call: { tool: "felag_lint", input: {} } },
  { ok: false, error: "E_NO_SPEC_SOURCE" },
);

// 7. spec not found — specDir given, snapshot empty.
fx(
  "fx-mcp-spec-not-found",
  "A felag_lint call naming a specDir whose interchange files are absent from the snapshot returns {ok:false, error:'E_SPEC_NOT_FOUND'} — distinct from E_NO_SPEC_SOURCE (a path WAS given; nothing was there).",
  { call: { tool: "felag_lint", input: { specDir: "spec/absent" } }, fs: {} },
  { ok: false, error: "E_SPEC_NOT_FOUND" },
);

// 8. lint orphans — orphan fixture surfaced in-band, valid stays true.
fx(
  "fx-mcp-lint-orphans",
  "felag_lint over a lint-valid spec that also carries a fixture referenced by no criterion returns {valid:true, errors:[], orphanFixtures:['fx-orphan']}. The orphan is a warning surfaced in-band, not a lint error — an implementation that promoted it to an error (valid:false) or dropped it from the result would diverge.",
  { call: { tool: "felag_lint", input: { spec: [...miniSpec, orphanFixture] } } },
  { ok: true, result: { valid: true, errors: [], orphanFixtures: ["fx-orphan"] } },
);

// 9. hash shape — fixtures only, ascending, fixtureHash computed.
fx(
  "fx-mcp-hash-shape",
  "felag_hash over a spec containing a preamble, item, criterion, and one fixture returns {hashes:[{id, hash}]} for the FIXTURE record only — non-fixture records are skipped — hash being felag-core's fixtureHash (CS9). An implementation that hashed every record, or omitted the {id,hash} shape, would diverge.",
  { call: { tool: "felag_hash", input: { spec: miniSpec } } },
  { ok: true, result: { hashes: [{ id: "fx1", hash: fixtureHash(miniFixture) }] } },
);

// 10. fmt round-trip — non-canonical text in, canonical out, read-only.
{
  const nonCanonical = '{"id":"it1","record":"item","title":"t","body":"b"}';
  fx(
    "fx-mcp-fmt-roundtrip",
    "felag_fmt over a non-canonical interchange line (keys out of CS4 order) returns {canonical} carrying the canonical serialization — record first, then id, then ascending keys, trailing LF. No file is written (dispatch holds no writer). This is the parse-then-serialize round-trip surfaced as a tool.",
    { call: { tool: "felag_fmt", input: { text: nonCanonical } } },
    { ok: true, result: { canonical: serialize(parse(nonCanonical)) } },
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
