// Composition — resolving the `requires` closure of a spec and rolling its
// conformance up to one product verdict.
//
// A spec's preamble is its root contract; `requires` are its split (cross-file)
// members. resolveClosure walks those edges, selecting one version per spec by
// Go-style Minimal Version Selection (the max of the exact versions required for
// it — deterministic, no ranges), and reports unresolved deps or cycles.
// verifyClosure then verifies each member and aggregates: a product conforms iff
// every spec in its closure conforms.
//
// This layer is PURE and callback-driven — it takes a `locate(spec, version)`
// to fetch a referenced spec's records and a `verifyOne(...)` to judge one spec,
// so it carries no disk/registry knowledge (that wiring lands in the registry
// phase). See docs/design/felag-composition-model.md.

import type { Preamble, SpecRecord, SpecRef } from "./records.js";

/** Fetch the records of a referenced spec at an exact version, or null if it
 * can't be found (→ E_UNRESOLVED_DEP). */
export type Locate = (spec: string, version: string) => SpecRecord[] | null;

/** Judge one resolved spec's conformance. Supplied by the caller (it owns the
 * conformance ledgers); the rollup only composes the verdicts. */
export type MemberVerdict = "conforms" | "drifts" | "unverified";
export type VerifyOne = (
  spec: string,
  version: string,
  records: SpecRecord[],
) => MemberVerdict;

export interface ClosureMember {
  spec: string;
  version: string;
  records: SpecRecord[];
}

export interface ClosureError {
  code: "E_UNRESOLVED_DEP" | "E_DEP_CYCLE";
  spec: string;
  version?: string;
  detail: string;
}

export interface ClosureResult {
  ok: boolean;
  root: { spec: string; version: string };
  /** Selected members in dependency order (deps before the dependents that
   * require them; the root last). Each carries its located records. Includes the
   * root. Empty when the root preamble is missing. */
  members: ClosureMember[];
  errors: ClosureError[];
}

function preambleOf(records: SpecRecord[]): Preamble | undefined {
  return records.find((r): r is Preamble => r.record === "preamble");
}

function requiresOf(records: SpecRecord[]): SpecRef[] {
  return preambleOf(records)?.requires ?? [];
}

const key = (spec: string, version: string): string => `${spec}@${version}`;

/** Compare two semver-ish strings (\d+.\d+.\d+, extra/non-numeric parts compared
 * lexically as a fallback). Returns <0, 0, >0. */
export function cmpSemver(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const sa = pa[i] ?? "0";
    const sb = pb[i] ?? "0";
    const na = Number(sa);
    const nb = Number(sb);
    if (Number.isInteger(na) && Number.isInteger(nb)) {
      if (na !== nb) return na < nb ? -1 : 1;
    } else if (sa !== sb) {
      return sa < sb ? -1 : 1;
    }
  }
  return 0;
}

/** Resolve a spec's full `requires` closure by MVS. The root's records are given
 * directly; every referenced spec is fetched via `locate` at its selected
 * version. Reports the first cause it hits: an unresolved dependency or a cycle.
 * Selection is deterministic — one version per spec, the max of the exact
 * versions any requirer pins for it. */
export function resolveClosure(rootRecords: SpecRecord[], locate: Locate): ClosureResult {
  const rootPre = preambleOf(rootRecords);
  if (!rootPre) {
    return {
      ok: false,
      root: { spec: "(unknown)", version: "(unknown)" },
      members: [],
      errors: [{ code: "E_UNRESOLVED_DEP", spec: "(root)", detail: "root has no preamble" }],
    };
  }
  const rootSpec = rootPre.name;
  const rootVer = rootPre.conformanceVersion;

  const selected = new Map<string, string>([[rootSpec, rootVer]]);
  const recordsByKey = new Map<string, SpecRecord[]>([[key(rootSpec, rootVer), rootRecords]]);
  const errors: ClosureError[] = [];

  // MVS fixpoint: bump each spec to the max version any requirer pins, re-reading
  // its requires at the new version, until nothing changes. Exact pins ⇒ versions
  // only increase and are bounded, so this terminates.
  const queue: string[] = [rootSpec];
  while (queue.length) {
    const name = queue.shift() as string;
    const ver = selected.get(name) as string;
    const k = key(name, ver);
    let recs = recordsByKey.get(k);
    if (recs === undefined) {
      const located = locate(name, ver);
      if (located === null) {
        errors.push({
          code: "E_UNRESOLVED_DEP",
          spec: name,
          version: ver,
          detail: `cannot locate ${k}`,
        });
        continue;
      }
      recs = located;
      recordsByKey.set(k, recs);
    }
    for (const dep of requiresOf(recs)) {
      const cur = selected.get(dep.spec);
      if (cur === undefined || cmpSemver(dep.version, cur) > 0) {
        selected.set(dep.spec, dep.version);
        queue.push(dep.spec);
      }
    }
  }

  // Cycle detection + dependency-order topo sort over the selected graph.
  const order: ClosureMember[] = [];
  const state = new Map<string, 0 | 1 | 2>(); // 0=visiting, 1=done; absent=unseen
  let cycle: ClosureError | null = null;
  const visit = (name: string, stack: string[]): void => {
    if (cycle) return;
    const st = state.get(name);
    if (st === 1) return;
    if (st === 0) {
      const at = stack.indexOf(name);
      cycle = {
        code: "E_DEP_CYCLE",
        spec: name,
        detail: `cycle: ${[...stack.slice(at), name].join(" → ")}`,
      };
      return;
    }
    const ver = selected.get(name) as string;
    const recs = recordsByKey.get(key(name, ver));
    if (recs === undefined) return; // unresolved — already reported above
    state.set(name, 0);
    for (const dep of requiresOf(recs)) {
      if (selected.has(dep.spec)) visit(dep.spec, [...stack, name]);
    }
    state.set(name, 1);
    order.push({ spec: name, version: ver, records: recs });
  };
  visit(rootSpec, []);
  if (cycle) errors.push(cycle);

  return {
    ok: errors.length === 0,
    root: { spec: rootSpec, version: rootVer },
    // A failed closure (cycle or unresolved) has no valid resolution to report —
    // members is the resolved order only when it actually resolved.
    members: errors.length ? [] : order,
    errors,
  };
}

export interface MemberReport {
  spec: string;
  version: string;
  verdict: MemberVerdict;
}

export interface ClosureVerdict {
  /** "incomplete" when the closure doesn't resolve; otherwise the rolled-up
   * verdict: conforms iff every member conforms; drifts if any drifts; else
   * unverified. */
  verdict: "conforms" | "drifts" | "unverified" | "incomplete";
  root: { spec: string; version: string };
  members: MemberReport[];
  errors: ClosureError[];
}

/** Resolve the closure and roll its per-spec conformance up to one product
 * verdict. A product is complete *and* conforming only when every spec in its
 * closure resolves and conforms. */
export function verifyClosure(
  rootRecords: SpecRecord[],
  locate: Locate,
  verifyOne: VerifyOne,
): ClosureVerdict {
  const closure = resolveClosure(rootRecords, locate);
  if (!closure.ok) {
    return { verdict: "incomplete", root: closure.root, members: [], errors: closure.errors };
  }
  const members: MemberReport[] = closure.members.map((m) => ({
    spec: m.spec,
    version: m.version,
    verdict: verifyOne(m.spec, m.version, m.records),
  }));
  const verdict = members.some((m) => m.verdict === "drifts")
    ? "drifts"
    : members.some((m) => m.verdict === "unverified")
      ? "unverified"
      : "conforms";
  return { verdict, root: closure.root, members, errors: [] };
}
