// audit — coverage, the felag/verifier class's second verb: criteria lacking
// passing records become task proposals across the felag-tasks contract,
// idempotent on (specItemRef, criterionId) — the idempotency lives in the
// work layer, per the felag-tasks seams item. With no work layer attached,
// proposals emit as a report artifact instead (design v1 tool table).

import { verify } from "./verify.js";
import type { WorkLayer } from "./tasks/layer.js";
import type { ProposalResult, TaskProposal } from "./tasks/store.js";
import type { ConformanceReport, Criterion, Preamble, VerifyInput } from "./records.js";

export interface AuditResult {
  report: ConformanceReport;
  proposals: TaskProposal[];
  // Present iff a work layer was attached: one result per proposal, in order.
  results?: ProposalResult[];
}

export function audit(input: VerifyInput, layer?: WorkLayer): AuditResult {
  const report = verify(input);
  const preamble = input.spec.find((r): r is Preamble => r.record === "preamble");
  const specName = preamble?.name ?? "spec";
  const criteria = new Map(
    input.spec
      .filter((r): r is Criterion => r.record === "criterion")
      .map((c) => [c.id, c]),
  );

  // One proposal per failing gating criterion. Waived criteria are covered
  // divergences with an expiry — they surface in the report, not as work;
  // they become work again when the waiver lapses and they re-enter failing.
  const proposals: TaskProposal[] = report.failing.map((criterionId) => {
    const c = criteria.get(criterionId);
    return {
      specItemRef: `${specName}#${c?.itemId ?? "unknown"}`,
      criterionId,
      title: `Conformance: ${criterionId} failing for ${input.implementation}`,
      description:
        `Criterion ${criterionId} (item ${c?.itemId ?? "unknown"}, spec ${specName} ` +
        `${report.conformanceVersion}) has no passing VerificationRecord for ` +
        `${input.implementation} as of ${input.asOf}. Fixtures: ` +
        `${(c?.fixtures ?? []).join(", ") || "(none)"}.`,
      attribution: "felag-audit",
      at: input.asOf,
    };
  });

  if (!layer) return { report, proposals };
  const results = proposals.map((p) => layer.propose(p as unknown as Record<string, unknown>));
  return { report, proposals, results };
}
