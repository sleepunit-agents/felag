// Composition closure resolver + verify roll-up (Phase 1 of the composition
// model). Pure and callback-driven; these exercise MVS selection, cycle/
// unresolved detection, and the product verdict rollup with in-memory specs.

import { describe, expect, it } from "vitest";
import type { SpecRecord, SpecRef } from "../src/records.js";
import {
  cmpSemver,
  resolveClosure,
  verifyClosure,
  type Locate,
  type MemberVerdict,
} from "../src/compose.js";

/** A minimal spec = just a preamble (closure resolution only reads requires). */
function spec(name: string, version: string, requires: SpecRef[] = []): SpecRecord[] {
  return [
    {
      record: "preamble",
      name,
      conformanceVersion: version,
      goals: [],
      contracts: [],
      exclusions: [],
      implementers: [],
      requires,
    },
  ] as unknown as SpecRecord[];
}
const ref = (spec: string, version: string): SpecRef => ({ spec, version });

/** Build a locate() from a catalog keyed by "name@version". */
function catalog(entries: Record<string, SpecRecord[]>): Locate {
  return (s, v) => entries[`${s}@${v}`] ?? null;
}

const names = (members: { spec: string; version: string }[]): string[] =>
  members.map((m) => `${m.spec}@${m.version}`);

describe("cmpSemver", () => {
  it("orders by numeric component", () => {
    expect(cmpSemver("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(cmpSemver("1.2.0", "1.10.0")).toBeLessThan(0); // numeric, not lexical
    expect(cmpSemver("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(cmpSemver("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("resolveClosure", () => {
  it("a leaf spec resolves to just itself", () => {
    const r = resolveClosure(spec("a", "1.0.0"), catalog({}));
    expect(r.ok).toBe(true);
    expect(names(r.members)).toEqual(["a@1.0.0"]);
  });

  it("resolves a chain in dependency order (deps before dependents)", () => {
    const cat = catalog({
      "b@1.0.0": spec("b", "1.0.0", [ref("c", "1.0.0")]),
      "c@1.0.0": spec("c", "1.0.0"),
    });
    const r = resolveClosure(spec("a", "1.0.0", [ref("b", "1.0.0")]), cat);
    expect(r.ok).toBe(true);
    expect(names(r.members)).toEqual(["c@1.0.0", "b@1.0.0", "a@1.0.0"]);
  });

  it("MVS picks the max of the versions a shared dep is pinned at", () => {
    const cat = catalog({
      "b@1.0.0": spec("b", "1.0.0", [ref("d", "1.0.0")]),
      "c@1.0.0": spec("c", "1.0.0", [ref("d", "1.2.0")]),
      "d@1.0.0": spec("d", "1.0.0"),
      "d@1.2.0": spec("d", "1.2.0"),
    });
    const root = spec("a", "1.0.0", [ref("b", "1.0.0"), ref("c", "1.0.0")]);
    const r = resolveClosure(root, cat);
    expect(r.ok).toBe(true);
    const ds = r.members.filter((m) => m.spec === "d");
    expect(ds).toHaveLength(1); // one version, not two copies
    expect(ds[0].version).toBe("1.2.0"); // the max
  });

  it("reports an unresolved dependency", () => {
    const r = resolveClosure(spec("a", "1.0.0", [ref("b", "1.0.0")]), catalog({}));
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].code).toBe("E_UNRESOLVED_DEP");
    expect(r.errors[0].spec).toBe("b");
  });

  it("detects a dependency cycle", () => {
    const cat = catalog({
      "b@1.0.0": spec("b", "1.0.0", [ref("a", "1.0.0")]),
    });
    const r = resolveClosure(spec("a", "1.0.0", [ref("b", "1.0.0")]), cat);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "E_DEP_CYCLE")).toBe(true);
  });
});

describe("verifyClosure (rollup)", () => {
  const cat = catalog({
    "b@1.0.0": spec("b", "1.0.0"),
    "c@1.0.0": spec("c", "1.0.0"),
  });
  const root = spec("a", "1.0.0", [ref("b", "1.0.0"), ref("c", "1.0.0")]);
  const all = (v: MemberVerdict): (() => MemberVerdict) => () => v;

  it("conforms iff every member conforms", () => {
    const r = verifyClosure(root, cat, all("conforms"));
    expect(r.verdict).toBe("conforms");
    expect(r.members.map((m) => m.spec).sort()).toEqual(["a", "b", "c"]);
  });

  it("drifts if any member drifts", () => {
    const r = verifyClosure(root, cat, (s) => (s === "c" ? "drifts" : "conforms"));
    expect(r.verdict).toBe("drifts");
  });

  it("unverified if a member is unverified and none drift", () => {
    const r = verifyClosure(root, cat, (s) => (s === "b" ? "unverified" : "conforms"));
    expect(r.verdict).toBe("unverified");
  });

  it("is incomplete when the closure does not resolve", () => {
    const r = verifyClosure(spec("a", "1.0.0", [ref("missing", "1.0.0")]), cat, all("conforms"));
    expect(r.verdict).toBe("incomplete");
    expect(r.members).toHaveLength(0);
    expect(r.errors[0].code).toBe("E_UNRESOLVED_DEP");
  });
});
