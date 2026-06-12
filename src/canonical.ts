// Canonical serialization (CS1–CS9, normative in spec/felag-core it-interchange).
// Readers liberal, writers strict: parse() accepts any schema-valid JSON lines;
// serialize() emits canonical form.

import { createHash } from "node:crypto";
import type { SpecRecord } from "./records.js";

// CS5 is satisfied by JSON.stringify's string quoting: it escapes only
// `"`, `\`, and U+0000–U+001F (short escapes where defined, lowercase
// \u00xx otherwise) and emits non-ASCII literally.
function quote(value: string | number | boolean | null): string {
  return JSON.stringify(value);
}

function canonicalValue(value: unknown, topLevel = false): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isInteger(value)) {
      throw new Error(`CS6 violation: non-integer number ${value}`);
    }
    return quote(value as string | number | boolean | null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalValue(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  let keys = Object.keys(obj).sort(); // ascending by code point
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
  return [...fixtures].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
