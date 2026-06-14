// felag-tasks conformance shim over beads (bd) — the proof that a foreign
// tracker conforms to the c-tasks contract via mapping only (ac-task-shim-thin).
//
// Mapping choices:
// - Spec linkage rides a marker as the first description line:
//   "[felag] <specItemRef> <criterionId|->" — the idempotency index lives in
//   the underlying system, per the contract's seams item.
// - Status mapping (native → contract): open|deferred → open;
//   in_progress|blocked → in_progress; closed → done. Contract `cancelled`
//   maps onto closed at transition time and therefore reports back as `done` —
//   a documented lossy edge (beads has no cancelled state); no fixture
//   exercises it, and a production shim would carry a label to disambiguate.
// - taskRef is the bd issue id, opaque per the contract.

import { execFileSync } from "node:child_process";
import type { ProposalResult, ReportEntry, TaskStatus } from "../tasks/store.js";
import type { WorkLayer } from "../tasks/layer.js";

const REQUIRED = ["specItemRef", "title", "attribution", "at"];

const NATIVE_TO_CONTRACT: Record<string, TaskStatus> = {
  open: "open",
  deferred: "open",
  in_progress: "in_progress",
  blocked: "in_progress",
  closed: "done",
};

const CONTRACT_TO_NATIVE: Record<TaskStatus, string> = {
  open: "open",
  in_progress: "in_progress",
  done: "closed",
  cancelled: "closed",
};

interface BdIssue {
  id: string;
  description?: string;
  status: string;
}

export class BeadsWorkLayer implements WorkLayer {
  constructor(private dir: string) {}

  private bd(args: string[]): string {
    return execFileSync("bd", ["-C", this.dir, "--sandbox", ...args], { encoding: "utf8" });
  }

  private listAll(): BdIssue[] {
    const out = this.bd(["list", "--json", "--status", "all"]);
    if (!out.trim()) return [];
    try {
      return JSON.parse(out) as BdIssue[];
    } catch {
      // bd printed non-JSON at exit 0 (a help banner, a warning) — surface a
      // diagnosable error rather than a bare V8 SyntaxError from deep in parse.
      throw new Error(`bd list returned non-JSON output: ${out.slice(0, 200)}`);
    }
  }

  private static marker(specItemRef: string, criterionId?: string): string {
    return `[felag] ${specItemRef} ${criterionId ?? "-"}`;
  }

  private static parseMarker(description?: string): { specItemRef: string; criterionId?: string } | null {
    const first = (description ?? "").split("\n", 1)[0];
    const m = first.match(/^\[felag\] (\S+) (\S+)$/);
    if (!m) return null;
    return { specItemRef: m[1], ...(m[2] !== "-" ? { criterionId: m[2] } : {}) };
  }

  propose(proposal: Record<string, unknown>): ProposalResult {
    const missing = REQUIRED.filter((f) => typeof proposal[f] !== "string");
    if (missing.length > 0) {
      return { accepted: false, created: false, taskRef: null, errors: ["E_MISSING_FIELD"] };
    }
    const specItemRef = proposal.specItemRef as string;
    const criterionId = proposal.criterionId as string | undefined;
    // The linkage marker is whitespace-delimited ("[felag] <ref> <crit>"), so an
    // id containing whitespace would round-trip lossily — report() could not
    // parse it back and would silently drop the task, breaking idempotency.
    // Reject it loudly. (The reference store has no such constraint; this is a
    // shim limitation of riding the marker on a free-text description line.)
    if (/\s/.test(specItemRef) || (criterionId !== undefined && /\s/.test(criterionId))) {
      return { accepted: false, created: false, taskRef: null, errors: ["E_MISSING_FIELD"] };
    }
    const marker = BeadsWorkLayer.marker(specItemRef, criterionId);

    const existing = this.listAll().find(
      (i) => (i.description ?? "").split("\n", 1)[0] === marker,
    );
    if (existing) {
      return { accepted: true, created: false, taskRef: existing.id, errors: [] };
    }

    const description = marker + (proposal.description ? `\n${proposal.description as string}` : "");
    const rawCreate = this.bd(["create", proposal.title as string, "-d", description, "--json"]);
    let created: { id: string };
    try {
      created = JSON.parse(rawCreate) as { id: string };
    } catch {
      // A leading-dash title can be swallowed by bd's own arg parser, yielding
      // non-JSON on stdout. Name the likely cause instead of a bare SyntaxError.
      throw new Error(
        `bd create returned non-JSON (a leading-dash title may confuse bd's parser): title=${JSON.stringify(proposal.title)}`,
      );
    }
    if (typeof created?.id !== "string") {
      throw new Error(`bd create returned no id: ${rawCreate.slice(0, 200)}`);
    }
    return { accepted: true, created: true, taskRef: created.id, errors: [] };
  }

  report(): { entries: ReportEntry[] } {
    const entries: ReportEntry[] = [];
    for (const issue of this.listAll()) {
      const linkage = BeadsWorkLayer.parseMarker(issue.description);
      if (!linkage) continue; // only spec-linked tasks are reported
      entries.push({
        taskRef: issue.id,
        specItemRef: linkage.specItemRef,
        ...(linkage.criterionId !== undefined ? { criterionId: linkage.criterionId } : {}),
        status: NATIVE_TO_CONTRACT[issue.status] ?? "open",
      });
    }
    entries.sort((a, b) => {
      if (a.specItemRef !== b.specItemRef) return a.specItemRef < b.specItemRef ? -1 : 1;
      const ac = a.criterionId ?? "";
      const bc = b.criterionId ?? "";
      if (ac !== bc) return ac < bc ? -1 : 1;
      return a.taskRef < b.taskRef ? -1 : 1;
    });
    return { entries };
  }

  transition(taskRef: string, to: TaskStatus): { ok: boolean } {
    const native = CONTRACT_TO_NATIVE[to];
    if (!native) return { ok: false };
    try {
      if (native === "closed") this.bd(["close", taskRef]);
      else this.bd(["update", taskRef, "--status", native]);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
}
