// The WorkLayer interface — the c-tasks contract surface, as TypeScript.
// TaskStore (reference) and any shim implement exactly this; the op-sequence
// runner and the conformance harness are written against it, never against
// an implementation.

import type { ProposalResult, ReportEntry, TaskStatus } from "./store.js";

export interface WorkLayer {
  propose(proposal: Record<string, unknown>): ProposalResult;
  report(): { entries: ReportEntry[] };
  transition(taskRef: string, to: TaskStatus): { ok: boolean };
}
