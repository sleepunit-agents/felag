// CS6 (2.0.0): a numeral that is valid JSON but non-finite as a double has
// no canonical form — the writer refuses rather than corrupt the value.
// Unfixturable in interchange (the corpus cannot carry the value), so the
// obligation rides here, per the residue exclusion.

import { describe, expect, it } from "vitest";
import { canonicalLine, parse, serialize } from "../src/canonical.js";

describe("CS6 non-finite refusal", () => {
  it("refuses a payload double that JSON spelled finite (1e309)", () => {
    const records = parse(
      '{"record":"fixture","id":"f1","contractId":"c1","description":"d","format":"json","input":{"x":1e309},"expected":{}}\n',
    );
    expect(() => serialize(records)).toThrow(/non-finite/);
  });

  it("refuses NaN and -Infinity reached through constructed records", () => {
    expect(() => canonicalLine({ record: "fixture", id: "f1", input: { x: Number.NaN } })).toThrow(/non-finite/);
    expect(() => canonicalLine({ record: "fixture", id: "f1", input: { x: -Infinity } })).toThrow(/non-finite/);
  });

  it("still emits finite payload numerals per RFC 8785", () => {
    expect(canonicalLine({ record: "x", v: { a: 600.5, b: 1e21, c: -0, d: 0.1 } })).toBe(
      '{"record":"x","v":{"a":600.5,"b":1e+21,"c":0,"d":0.1}}',
    );
  });
});
