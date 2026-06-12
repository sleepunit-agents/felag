// Record types for the felag interchange format (spec/felag-core 0.2.0).
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

export interface Preamble {
  record: "preamble";
  name: string;
  conformanceVersion: string;
  goals: string[];
  contracts: Contract[];
  exclusions: string[];
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
