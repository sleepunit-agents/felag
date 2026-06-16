// Composition end-to-end (Phase 7): the registry + closure resolver against
// felag's own real specs, plus the start-a-product / select / remove journey.
// Runs in an isolated temp XDG so it touches no real registry.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProject,
  listProjects,
  removeProject,
  resolveProductClosure,
  selectProject,
} from "../src/mcp/widgets/projects.js";

let tmp: string;
let savedXdg: string | undefined;

beforeAll(() => {
  savedXdg = process.env.XDG_CONFIG_HOME;
  tmp = mkdtempSync(join(tmpdir(), "felag-comp-"));
  process.env.XDG_CONFIG_HOME = tmp; // configDir() is lazy → picked up here
});
afterAll(() => {
  if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedXdg;
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("composition end-to-end", () => {
  it("felag resolves as a product over its three pieces", () => {
    const c = resolveProductClosure("felag");
    const specs = c.members.map((m) => m.spec).sort();
    expect(specs).toEqual(["felag", "felag-core", "felag-mcp", "felag-tasks"]);
    expect(c.members.find((m) => m.spec === "felag-core")?.verdict).toBe("conforms");
    expect(c.members.find((m) => m.spec === "felag")?.isRoot).toBe(true);
    // The product rolls up unverified — the root and felag-mcp have no ledger.
    expect(c.verdict).toBe("unverified");
    expect(c.errors).toHaveLength(0);
  });

  it("lists felag's specs as builtins with derived roles", () => {
    const list = listProjects();
    const felag = list.find((p) => p.name === "felag");
    expect(felag?.resolvedRole).toBe("product");
    expect(felag?.isProduct).toBe(true);
    expect(felag?.memberCount).toBe(3);
    const core = list.find((p) => p.name === "felag-core");
    expect(core?.resolvedRole).toBe("module");
    expect(core?.builtin).toBe(true);
    expect(core?.verdict).toBe("conforms");
  });

  it("starts a new product (scaffold with requires), selects it, removes it", () => {
    const created = createProject("e2eprod", undefined, undefined, [
      { spec: "felag-core", version: "6.0.0" },
    ]);
    expect(created.scaffolded).toBe(true);
    expect(created.role).toBe("product");
    expect(created.warning).toBeUndefined(); // scaffold lints clean

    const c = resolveProductClosure("e2eprod");
    expect(c.members.find((m) => m.spec === "felag-core")?.verdict).toBe("conforms");

    expect(selectProject("e2eprod").active).toBe(true);
    expect(removeProject("e2eprod").removed).toBe(true);
  });

  it("refuses removing a builtin felag spec", () => {
    expect(() => removeProject("felag-core")).toThrow(/builtin/);
    expect(() => removeProject("felag")).toThrow(/builtin/);
  });

  it("reports incomplete on an unresolvable version pin", () => {
    createProject("badpin", undefined, undefined, [{ spec: "felag-core", version: "9.9.9" }]);
    const c = resolveProductClosure("badpin");
    expect(c.verdict).toBe("incomplete");
    expect(c.errors.some((e) => e.code === "E_UNRESOLVED_DEP")).toBe(true);
    removeProject("badpin");
  });
});
