// Project registry + active-project state + the project resolver.
//
// The view widgets used to hardwire felag-core (felag auditing itself). This
// module is what lets them look at ANY registered spec: a persisted registry of
// projects (name → spec dir + optional conformance source), a single active
// project the zero-arg widgets read, and resolveProject() — the one place that
// turns "which project?" into the loaded spec ⋈ conformance bundle every widget
// model consumes.
//
// felag-core is the builtin default: it is NOT stored on disk (its paths are
// recomputed from the repo each load, so it can never go stale) and create/remove
// protect it. The registry file persists only the non-builtin projects plus the
// active selection. Single-user MCP on `one` → global active state is fine.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "../../canonical.js";
import type {
  Fixture,
  SpecRecord,
  VerificationRecord,
} from "../../records.js";
import {
  governanceHistory,
  resolveRepoRoot,
  type HistoryEntry,
} from "./shared.js";

const BUILTIN = "felag-core";

export interface ProjectEntry {
  specDir: string;
  description: string;
  builtin?: boolean;
  /** Path to a conformance ledger (VerificationRecord[] as jsonl). Absent → the
   * project is spec-only and the widgets render it unverified. */
  records?: string;
  /** Implementation name the conformance is attributed to (default "impl"). */
  implementation?: string;
  /** Governance dir (holds <date>-<critId>.{transition,result}.json). Default
   * <specDir>/governance. */
  governance?: string;
}

interface RegistryFile {
  active: string;
  projects: Record<string, ProjectEntry>; // non-builtin only
}

const CONFIG_DIR = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "felag",
);
const REGISTRY_PATH = join(CONFIG_DIR, "projects.json");
const PROJECTS_ROOT = join(CONFIG_DIR, "projects"); // scaffolded specs live here

/** felag-core, recomputed from the repo every load so its paths never go stale. */
function builtinEntry(): ProjectEntry {
  const root = resolveRepoRoot();
  return {
    specDir: join(root, "spec", "felag-core"),
    description: "felag's own spec — the dogfooding self-audit",
    builtin: true,
    records: join(root, "verification", "felag-ts.records.jsonl"),
    implementation: "felag-ts",
    governance: join(root, "governance"),
  };
}

function readRegistry(): RegistryFile {
  if (existsSync(REGISTRY_PATH)) {
    try {
      const r = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
      return {
        active: typeof r.active === "string" ? r.active : BUILTIN,
        projects:
          r.projects && typeof r.projects === "object" ? r.projects : {},
      };
    } catch {
      /* corrupt file → fall back to defaults rather than crash the server */
    }
  }
  return { active: BUILTIN, projects: {} };
}

function writeRegistry(r: RegistryFile): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(r, null, 2));
}

/** Every project, builtin always present + protected (wins over any disk entry). */
function allEntries(r: RegistryFile = readRegistry()): Record<string, ProjectEntry> {
  return { ...r.projects, [BUILTIN]: builtinEntry() };
}

/** The active project name, falling back to felag-core if the stored choice no
 * longer resolves. */
function activeName(r: RegistryFile = readRegistry()): string {
  const all = allEntries(r);
  return all[r.active] ? r.active : BUILTIN;
}

export interface ProjectInfo extends ProjectEntry {
  name: string;
  active: boolean;
}

/** List every project, builtin first, marking the active one. */
export function listProjects(): ProjectInfo[] {
  const r = readRegistry();
  const all = allEntries(r);
  const active = activeName(r);
  return Object.entries(all)
    .map(([name, e]) => ({ name, ...e, active: name === active }))
    .sort((a, b) =>
      a.builtin ? -1 : b.builtin ? 1 : a.name.localeCompare(b.name),
    );
}

/** The active project entry (name + entry). */
export function currentProject(): ProjectInfo {
  const r = readRegistry();
  const name = activeName(r);
  return { name, ...allEntries(r)[name], active: true };
}

const SCAFFOLD_FIXTURES = "";
function scaffoldPreamble(name: string): string {
  const preamble = {
    record: "preamble",
    name,
    conformanceVersion: "0.1.0",
    goals: [],
    contracts: [],
    exclusions: [],
    implementers: [{ name: `${name}-impl`, roles: ["repo-owner"] }],
  };
  return `${JSON.stringify(preamble)}\n`;
}

export interface CreateResult extends ProjectInfo {
  scaffolded: boolean;
  warning?: string;
}

/** Register a project. specDir present+exists → adopt in place (never move
 * files). specDir omitted → scaffold an empty valid spec under the managed root.
 * Rejects duplicate / builtin-colliding names. */
export function createProject(
  name: string,
  specDir?: string,
  description?: string,
): CreateResult {
  if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`invalid project name "${name}" (use letters, digits, . _ -)`);
  }
  if (name === BUILTIN) throw new Error(`"${BUILTIN}" is the builtin project and cannot be recreated`);
  const r = readRegistry();
  if (r.projects[name]) throw new Error(`project "${name}" already exists`);

  let dir: string;
  let scaffolded = false;
  let warning: string | undefined;

  if (specDir) {
    if (!existsSync(join(specDir, "spec.jsonl"))) {
      throw new Error(`no spec.jsonl under specDir ${specDir}`);
    }
    dir = specDir; // adopt in place
  } else {
    dir = join(PROJECTS_ROOT, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "spec.jsonl"), scaffoldPreamble(name));
    writeFileSync(join(dir, "fixtures.jsonl"), SCAFFOLD_FIXTURES);
    scaffolded = true;
  }

  const entry: ProjectEntry = {
    specDir: dir,
    description: description ?? (scaffolded ? `scaffolded project ${name}` : `adopted spec at ${dir}`),
  };
  r.projects[name] = entry;
  writeRegistry(r);

  // Best-effort lint-on-adopt: warn, never hard-fail (per design 3.4).
  try {
    const resolved = resolveProject(name);
    void resolved;
  } catch (e) {
    warning = `registered, but loading the spec raised: ${String(e instanceof Error ? e.message : e)}`;
  }

  return { name, ...entry, active: false, scaffolded, warning };
}

/** Set the active project. Hard-errors on an unknown name (this is the explicit
 * management path — unlike resolveProject, which is lenient for the widgets). */
export function selectProject(name: string): ProjectInfo {
  const r = readRegistry();
  if (!allEntries(r)[name]) throw new Error(`unknown project "${name}"`);
  r.active = name;
  writeRegistry(r);
  return { name, ...allEntries(r)[name], active: true };
}

/** Deregister a project. Refuses the builtin; never deletes spec files. */
export function removeProject(name: string): { name: string; removed: boolean } {
  if (name === BUILTIN) throw new Error(`"${BUILTIN}" is builtin and cannot be removed`);
  const r = readRegistry();
  if (!r.projects[name]) throw new Error(`unknown project "${name}"`);
  delete r.projects[name];
  if (r.active === name) r.active = BUILTIN; // fall active back to the builtin
  writeRegistry(r);
  return { name, removed: true };
}

export interface ResolvedProject {
  name: string;
  specDir: string;
  /** spec.jsonl records (preamble + items + criteria) — what the widgets that
   * currently pass coreSpec() should keep passing (felag-core byte-stable). */
  spec: SpecRecord[];
  /** fixtures.jsonl records. */
  fixtureRecords: Fixture[];
  /** spec + fixtures concatenated — what lint needs (resolveSpec parity). */
  fullSpec: SpecRecord[];
  items: Record<string, { title: string; body: string }>;
  fixtures: Record<string, { description: string; format: string }>;
  /** Conformance ledger, or undefined when the project is spec-only. */
  records: VerificationRecord[] | undefined;
  implementation: string;
  history: Record<string, HistoryEntry[]>;
}

/** Resolve which project a widget should show, then load its bundle.
 * Order: explicit override (if registered) → active → felag-core. Lenient: an
 * unknown override silently falls back rather than breaking the widget. */
export function resolveProject(override?: string): ResolvedProject {
  const r = readRegistry();
  const all = allEntries(r);
  const name = override && all[override] ? override : activeName(r);
  const entry = all[name];

  const spec = parse(
    readFileSync(join(entry.specDir, "spec.jsonl"), "utf8"),
  ) as unknown as SpecRecord[];

  const fxPath = join(entry.specDir, "fixtures.jsonl");
  const fixtureRecords = existsSync(fxPath)
    ? (parse(readFileSync(fxPath, "utf8")) as unknown as Fixture[]).filter(
        (rec) => rec.record === "fixture",
      )
    : [];

  const items: Record<string, { title: string; body: string }> = {};
  for (const rec of spec as { record: string; id?: string; title?: string; body?: string }[]) {
    if (rec.record === "item" && rec.id) items[rec.id] = { title: rec.title ?? rec.id, body: rec.body ?? "" };
  }
  const fixtures: Record<string, { description: string; format: string }> = {};
  for (const rec of fixtureRecords as { id?: string; description?: string; format?: string }[]) {
    if (rec.id) fixtures[rec.id] = { description: rec.description ?? "", format: rec.format ?? "" };
  }

  let records: VerificationRecord[] | undefined;
  if (entry.records && existsSync(entry.records)) {
    records = parse(readFileSync(entry.records, "utf8")) as unknown as VerificationRecord[];
  }

  const govDir = entry.governance ?? join(entry.specDir, "governance");
  const history = governanceHistory(govDir);

  return {
    name,
    specDir: entry.specDir,
    spec,
    fixtureRecords,
    fullSpec: [...spec, ...fixtureRecords],
    items,
    fixtures,
    records,
    implementation: entry.implementation ?? "impl",
    history,
  };
}
