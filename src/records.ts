// Record types for the felag interchange format (spec/felag-core 1.0.0).
// The committed JSONL interchange files are the source of truth; these types
// mirror spec/felag-core/schema.json.

export type RecordType = "preamble" | "item" | "criterion" | "fixture";

export interface Contract {
  id: string;
  description: string;
}

export interface Implementer {
  name: string;
  roles: string[];
}

export interface Governance {
  timeoutDays: number; // >= 1; default 30 when the field is absent
}

export interface Preamble {
  record: "preamble";
  name: string;
  conformanceVersion: string;
  goals: string[];
  contracts: Contract[];
  exclusions: string[];
  governance?: Governance;
  implementers: Implementer[];
}

export interface Item {
  record: "item";
  id: string;
  title: string;
  body: string;
  interfaceSketch?: string;
}

export type CriterionState = "proposed" | "active" | "deprecated" | "disputed";
export type CriterionClass = "behavioral" | "judgment";
export type Force = "MUST" | "SHOULD" | "MAY";

export interface Dispute {
  by: string; // implementer roster reference — carries semantics (sole exception)
  reason: string;
  at: string;
}

export interface Criterion {
  record: "criterion";
  id: string;
  itemId: string;
  type: "scenario" | "checklist";
  class: CriterionClass;
  gherkin?: string;
  item?: string;
  force: Force;
  state: CriterionState;
  source: "forethought" | "discovered";
  discoveredAt?: string;
  discoveredBy?: string;
  triggeringEvent?: string;
  contractId?: string;
  fixtures: string[];
  dispute?: Dispute;
  judgment?: { rubric: string; judgeConfig: string; reproducibility: string };
}

export interface Fixture {
  record: "fixture";
  id: string;
  contractId?: string; // optional since 0.2.0 — advisory criteria may reference fixtures voluntarily
  description: string;
  format: string;
  input: unknown;
  expected: unknown;
}

export type SpecRecord = Preamble | Item | Criterion | Fixture;

export type Verdict = "pass" | "fail" | "unverifiable";

export interface VerificationRecord {
  criterionId: string;
  fixtureId?: string;
  fixtureHash?: string;
  implementation: string;
  implementationVersion: string;
  conformanceVersion: string;
  verdict: Verdict;
  evidence: string;
  runner: string;
  at: string;
  attribution: string;
}

export interface Waiver {
  criterionId: string;
  implementation: string;
  kind: "waiver" | "known-bug";
  justification: string;
  attribution: string;
  expiresAt: string;
}

export interface LintError {
  code: string;
  ref: string;
}

export interface LintResult {
  valid: boolean;
  errors: LintError[];
}

export interface IngestResult {
  accepted: boolean;
  errors: string[];
}

export type ReportVerdict = "conforms" | "conforms-with-waivers" | "drifts";

export interface ConformanceReport {
  advisory: { criterionId: string; verdict: Verdict }[];
  conformanceVersion: string;
  disputed: string[];
  failing: string[];
  implementation: string;
  verdict: ReportVerdict;
  waived: string[];
}

export interface VerifyInput {
  asOf: string;
  implementation: string;
  records: VerificationRecord[];
  spec: SpecRecord[];
  waivers?: Waiver[];
}

// ---- felag/author class wire formats (c-author, proposed at 1.0.0) ----

export interface Acknowledgment {
  implementer: string; // roster reference
  decision: "ack" | "nak";
  at: string;
  criterionHash: string; // CS9 hash of the criterion line as acknowledged
}

export interface PromotionTransition {
  criterionId: string;
  to: "active" | "rejected" | "known-bug";
  requestedAt: string;
  requestedBy: string; // roster reference
  implementation?: string; // known-bug only; opaque, NOT roster-validated
  justification?: string; // known-bug only
  expiresAt?: string; // known-bug only
  attribution?: string; // known-bug only
  acknowledgments: Acknowledgment[];
}

export interface PromotionInput {
  asOf: string;
  spec: SpecRecord[];
  transition: PromotionTransition;
}

export interface PromotionResult {
  accepted: boolean;
  errors: string[]; // all holding predicates, sorted ascending
  outcome: "ratified" | "rejected" | null;
  lapsed: string[]; // sorted ascending
  stale: string[]; // sorted ascending
  waiver: Waiver | null;
}

export interface AuthorOutputInput {
  spec: SpecRecord[];
  new: string[]; // criterion ids this interview authored
  budgets?: { criteriaPerItem: number }; // default 7, pinned in the wire format
}

export interface ExcavateOutputInput {
  scope: { contracts: string[] } | null;
  spec: SpecRecord[];
}

export interface RenderInventoryInput {
  spec: SpecRecord[];
  audience: "stakeholder" | "developer" | "verifier";
}

export interface RenderInventory {
  included: string[]; // exact set of record ids, sorted ascending
  excludedFields: string[]; // exact set, sorted ascending
}

export interface PrimeOutputInput {
  spec: SpecRecord[];
  output: string;
}
