// felag MCP adapter — the pure dispatch function (spec/felag-mcp c-mcp).
//
// mcpDispatch(call, fs) is a total function over (tool-call, filesystem
// snapshot) -> result envelope. It owns the felag-specific adapter surface a
// second MCP implementation could diverge on: spec-source resolution
// (inline-vs-path precedence), totality (every thrown library or load error
// mapped to a structured {ok:false} result, never propagated), and the result
// shape each tool returns. The verb CORES (lint/verify/audit/promote/graduate/
// render/prime + author-class validators + hash/fmt) are felag-core's contract
// and felag-ts already CONFORMS to them; this layer never re-derives a verb's
// result — it only resolves I/O, shapes the result, and maps errors.
//
// The filesystem is an explicit path->content snapshot, NOT a live read, so
// path-loading is a pure, fixturable function. The MCP server (transport) builds
// the snapshot by reading the requested specDir from disk; the contract gates
// only on this pure function.

import { fixtureHash, parse, serialize } from "../canonical.js";
import { lint } from "../lint.js";
import { verify } from "../verify.js";
import { graduate } from "../graduation.js";
import { promote } from "../promotion.js";
import { emitPrime } from "../prime.js";
import { audit } from "../audit.js";
import {
  renderInventory,
  validateAuthorOutput,
  validateExcavateOutput,
  validatePrimeOutput,
} from "../author.js";
import type {
  Criterion,
  Fixture,
  PromotionInput,
  RenderInventoryInput,
  SpecRecord,
  VerificationRecord,
  VerifyInput,
} from "../records.js";

/** The result envelope. Totality: dispatch returns one of these, never throws.
 * On failure, `error` is a stable E_* code (normative — the divergence point)
 * and `detail` is a required non-empty human string (its WORDING is not
 * normative; its presence and type are). */
export type McpEnvelope =
  | { ok: true; result: unknown }
  | { ok: false; error: string; detail: string };

export interface McpCall {
  tool: string;
  input?: Record<string, unknown>;
}

/** Snapshot of the files dispatch may read, keyed by logical "dir/file" path
 * joined with "/" (dispatch owns the join so fixtures are deterministic and
 * platform-independent). */
export type FsSnapshot = Record<string, string>;

/** A mapped, non-propagating error: its `code` becomes the envelope's `error`. */
class McpError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** parse() with JSON failures remapped to the stable E_PARSE code rather than a
 * raw SyntaxError that would fall through to E_LIB. */
function parseOrThrow(text: string, ref: string): SpecRecord[] {
  try {
    return parse(text);
  } catch (e) {
    throw new McpError("E_PARSE", `unparseable interchange (${ref}): ${(e as Error).message}`);
  }
}

/** Spec-source resolution. The spec content travels under inline `spec` (a
 * SpecRecord array) or `specDir` (a path) — `records` is reserved for evidence
 * (verify/audit/graduate), which would otherwise collide. Inline `spec` wins
 * when present; otherwise `specDir` is loaded from the snapshot (spec.jsonl +
 * fixtures.jsonl, either may be absent, records concatenate — loadSpecDir
 * parity). Neither present is E_NO_SPEC_SOURCE; a specDir whose files are absent
 * from the snapshot is E_SPEC_NOT_FOUND. */
function resolveSpec(input: Record<string, unknown>, fs: FsSnapshot): SpecRecord[] {
  if (Array.isArray(input.spec)) return input.spec as SpecRecord[];
  if (typeof input.specDir === "string") {
    const specPath = `${input.specDir}/spec.jsonl`;
    const fixturesPath = `${input.specDir}/fixtures.jsonl`;
    const hasSpec = Object.prototype.hasOwnProperty.call(fs, specPath);
    const hasFixtures = Object.prototype.hasOwnProperty.call(fs, fixturesPath);
    if (!hasSpec && !hasFixtures) {
      throw new McpError("E_SPEC_NOT_FOUND", `no interchange files under ${input.specDir}`);
    }
    const records: SpecRecord[] = [];
    if (hasSpec) records.push(...parseOrThrow(fs[specPath], specPath));
    if (hasFixtures) records.push(...parseOrThrow(fs[fixturesPath], fixturesPath));
    return records;
  }
  throw new McpError("E_NO_SPEC_SOURCE", "provide records (inline) or specDir (path)");
}

function required<T>(input: Record<string, unknown>, key: string): T {
  const v = input[key];
  if (v === undefined || v === null) {
    throw new McpError("E_BAD_INPUT", `missing required input: ${key}`);
  }
  return v as T;
}

/** Fixtures referenced by no criterion — the CLI's stderr orphan warning,
 * surfaced in-band. Sorted ascending. */
function orphanFixtures(spec: SpecRecord[]): string[] {
  const referenced = new Set(
    spec.flatMap((r) => (r.record === "criterion" ? (r as Criterion).fixtures : [])),
  );
  const ids = spec
    .filter((r): r is Fixture => r.record === "fixture" && !referenced.has((r as Fixture).id))
    .map((f) => f.id);
  return [...new Set(ids)].sort(); // a SET, per it-mcp-tools (dedup a duplicated id)
}

function buildVerifyInput(input: Record<string, unknown>, fs: FsSnapshot): VerifyInput {
  return {
    asOf: required<string>(input, "asOf"),
    implementation: required<string>(input, "implementation"),
    records: (input.records as VerificationRecord[] | undefined) ?? [],
    spec: resolveSpec(input, fs),
    waivers: (input.waivers as VerifyInput["waivers"]) ?? [],
    judgmentRecords: input.judgmentRecords as VerifyInput["judgmentRecords"],
  };
}

// verify/audit/graduate take BOTH a spec (the contract, under spec/specDir) and
// records (the evidence). fmt takes its raw record array under `records` (it
// resolves no spec — it is a pure serializer).

type Handler = (input: Record<string, unknown>, fs: FsSnapshot) => unknown;

const HANDLERS: Record<string, Handler> = {
  felag_lint: (input, fs) => {
    const spec = resolveSpec(input, fs);
    const r = lint(spec);
    return { valid: r.valid, errors: r.errors, orphanFixtures: orphanFixtures(spec) };
  },

  felag_fmt: (input) => {
    // Round-trip serialization. Read-only: dispatch has no writer, so fmt
    // (like every tool) cannot mutate the filesystem — it returns canonical text.
    let records: SpecRecord[];
    if (Array.isArray(input.records)) {
      records = input.records as SpecRecord[];
    } else if (typeof input.text === "string") {
      records = parseOrThrow(input.text, "text");
    } else {
      throw new McpError("E_BAD_INPUT", "provide records (inline) or text (raw jsonl)");
    }
    return { canonical: serialize(records) };
  },

  felag_hash: (input, fs) => {
    const spec = resolveSpec(input, fs);
    const only = typeof input.fixtureId === "string" ? input.fixtureId : undefined;
    const hashes = spec
      .filter((r): r is Fixture => r.record === "fixture" && (!only || (r as Fixture).id === only))
      .map((f) => ({ id: f.id, hash: fixtureHash(f) }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { hashes };
  },

  felag_verify: (input, fs) => verify(buildVerifyInput(input, fs)),

  felag_audit: (input, fs) => audit(buildVerifyInput(input, fs)),

  felag_promote: (input, fs) => {
    // Required-input checks precede spec resolution (it-mcp-dispatch ordering):
    // do NOT inline these into the object literal — JS evaluates properties in
    // source order, which would resolve the spec before the transition check.
    const asOf = required<string>(input, "asOf");
    const transition = required<PromotionInput["transition"]>(input, "transition");
    return promote({ asOf, spec: resolveSpec(input, fs), transition });
  },

  felag_graduate: (input, fs) =>
    graduate({
      criterionId: required<string>(input, "criterionId"),
      implementation: required<string>(input, "implementation"),
      records: (input.records as VerifyInput["judgmentRecords"]) ?? [],
      spec: resolveSpec(input, fs),
    }),

  felag_render: (input, fs) => {
    const audience = required<RenderInventoryInput["audience"]>(input, "audience"); // before spec (ordering)
    return renderInventory({ spec: resolveSpec(input, fs), audience });
  },

  felag_prime: (input, fs) => emitPrime(resolveSpec(input, fs)),

  felag_validate_author: (input, fs) =>
    validateAuthorOutput({
      spec: resolveSpec(input, fs),
      new: (input.new as string[]) ?? [],
      budgets: input.budgets as { criteriaPerItem: number } | undefined,
    }),

  felag_validate_excavate: (input, fs) =>
    validateExcavateOutput({
      spec: resolveSpec(input, fs),
      scope: (input.scope as { contracts: string[] } | null) ?? null,
    }),

  felag_validate_prime: (input, fs) => {
    const output = required<string>(input, "output"); // before spec resolution (ordering rule)
    return validatePrimeOutput({ spec: resolveSpec(input, fs), output });
  },
};

/** The twelve tool names the registry dispatch routes (handler insertion order;
 * eight share a CLI verb stem, the four author-class validators do not). */
export const TOOL_NAMES = Object.keys(HANDLERS);

/** Total dispatch: route the call, wrap success as {ok:true,result}, map any
 * thrown McpError to its code and any other throw to E_LIB. Never throws. */
export function mcpDispatch(call: McpCall, fs: FsSnapshot = {}): McpEnvelope {
  // Totality is absolute, including outside the typed {tool,input} domain: a
  // null/non-object call never throws past this point.
  if (call === null || typeof call !== "object") {
    return { ok: false, error: "E_BAD_INPUT", detail: "call must be an object { tool, input }" };
  }
  const handler = HANDLERS[call.tool];
  if (!handler) {
    return { ok: false, error: "E_UNKNOWN_TOOL", detail: `no such tool: ${call.tool}` };
  }
  try {
    return { ok: true, result: handler(call.input ?? {}, fs) };
  } catch (e) {
    if (e instanceof McpError) return { ok: false, error: e.code, detail: e.message };
    return { ok: false, error: "E_LIB", detail: (e as Error).message ?? String(e) };
  }
}
