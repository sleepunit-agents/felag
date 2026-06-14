// Canonical serialization (CS1–CS9, normative in spec/felag-core it-interchange).
// Readers liberal, writers strict: parse() accepts any schema-valid JSON lines;
// serialize() emits canonical form.

import { createHash } from "node:crypto";
import type { SpecRecord } from "./records.js";

/** Ascending by Unicode code point (CS4/CS8's order), NOT the default
 * `String.prototype.sort` UTF-16 code-unit order — they diverge above the BMP
 * (a lead surrogate 0xD800–0xDBFF sorts below 0xE000–0xFFFF by code unit but a
 * code point ≥ U+10000 sorts above them). This comparator is load-bearing: it
 * feeds CS4 key order → the canonical line → every CS9 hash, so a UTF-16 sort
 * would make a record with an astral-plane key hash differently than a
 * code-point-correct writer, silently breaking cross-implementation agreement. */
export function cmpCodePoint(a: string, b: string): number {
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const av = ai.next();
    const bv = bi.next();
    if (av.done && bv.done) return 0;
    if (av.done) return -1;
    if (bv.done) return 1;
    const ac = av.value.codePointAt(0)!;
    const bc = bv.value.codePointAt(0)!;
    if (ac !== bc) return ac - bc;
  }
}

// CS5 is satisfied by JSON.stringify's string quoting: it escapes only
// `"`, `\`, and U+0000–U+001F (short escapes where defined, lowercase
// \u00xx otherwise) and emits non-ASCII literally. A lone surrogate (an
// unpaired code unit U+D800–U+DFFF) has no UTF-8 representation, so it is
// escaped as \udXXX with lowercase hex — the one CS5 exception (matching
// ECMAScript well-formed JSON.stringify and RFC 8785 §3.2.2.2).
function quote(value: string | number | boolean | null): string {
  return JSON.stringify(value);
}

function canonicalValue(value: unknown, topLevel = false): string {
  if (value === null || typeof value !== "object") {
    // CS6: format-defined fields are integers (schema-enforced); payload
    // subtrees carry any finite JSON number, serialized per RFC 8785
    // (ECMAScript Number serialization — exactly what JSON.stringify emits).
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`CS6 violation: non-finite number ${value}`);
    }
    return quote(value as string | number | boolean | null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalValue(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  let keys = Object.keys(obj).sort(cmpCodePoint); // CS4: ascending by code point
  if (topLevel) {
    // CS4: 'record' first, then 'id' when present, then the rest ascending.
    const head = ["record", "id"].filter((k) => k in obj);
    keys = [...head, ...keys.filter((k) => !head.includes(k))];
  }
  const body = keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${quote(k)}:${canonicalValue(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/** Canonical line for one record (no trailing LF). */
export function canonicalLine(record: object): string {
  return canonicalValue(record, true);
}

/** Serialize records to a canonical interchange file body (CS1/CS2/CS7-order-preserving). */
export function serialize(records: object[]): string {
  return records.map((r) => canonicalLine(r)).join("\n") + "\n";
}

/** Reader-liberal parse of an interchange file body. */
export function parse(text: string): SpecRecord[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as SpecRecord);
}

/** CS9: 'sha256:' + lowercase hex SHA-256 of the canonical record line (no
 * trailing LF). Generic over record type: fixtureHash on VerificationRecords
 * and criterionHash on promotion acknowledgments are the same operation. */
export function recordHash(record: object): string {
  const line = canonicalLine(record);
  return "sha256:" + createHash("sha256").update(line, "utf8").digest("hex");
}

/** CS9 applied to a fixture record (the name the spec uses in it-fixtures). */
export const fixtureHash = recordHash;

/** CS8: fixtures.jsonl record order — ascending by id, code-point order. */
export function sortFixtures<T extends { id: string }>(fixtures: T[]): T[] {
  return [...fixtures].sort((a, b) => cmpCodePoint(a.id, b.id));
}
