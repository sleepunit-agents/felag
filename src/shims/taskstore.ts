// felag-tasks adapter over taskstore — the first-party work store. Drives the
// live sqlite store through the `taskstore` CLI, so `felag audit --taskstore`
// files conformance drift straight into real tracked work.
//
// Unlike the beads shim, taskstore carries felag linkage as FIRST-CLASS
// structured fields (--spec-item-ref / --criterion-id) with native idempotency
// on (specItemRef, criterionId), and its `report` is already the contract
// shape. So there is no stringly description marker to write or parse back —
// the brittleness the 2026-06-13 audit flagged in the beads shim is absent here.
//
// Store isolation: when constructed with a dir, TASKSTORE_DB is pinned to
// <dir>/.taskstore/store.db so a run never touches an ambient store by
// accident. With no dir, the ambient taskstore default/env is inherited.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { ProposalResult, ReportEntry, TaskStatus } from "../tasks/store.js";
import type { WorkLayer } from "../tasks/layer.js";

const REQUIRED = ["specItemRef", "title", "attribution", "at"];

interface CreateResult {
  ok: boolean;
  created: boolean;
  id: string | null;
  errors?: string[];
}

export class TaskstoreWorkLayer implements WorkLayer {
  private readonly env: NodeJS.ProcessEnv;

  constructor(dir?: string) {
    this.env = dir
      ? { ...process.env, TASKSTORE_DB: join(dir, ".taskstore", "store.db") }
      : process.env;
  }

  private ts(args: string[]): string {
    return execFileSync("taskstore", args, { encoding: "utf8", env: this.env });
  }

  private parse<T>(out: string, verb: string): T {
    try {
      return JSON.parse(out) as T;
    } catch {
      throw new Error(`taskstore ${verb} returned non-JSON output: ${out.slice(0, 200)}`);
    }
  }

  propose(proposal: Record<string, unknown>): ProposalResult {
    const missing = REQUIRED.filter((f) => typeof proposal[f] !== "string");
    if (missing.length > 0) {
      return { accepted: false, created: false, taskRef: null, errors: ["E_MISSING_FIELD"] };
    }
    const args = ["create", proposal.title as string, "--spec-item-ref", proposal.specItemRef as string];
    if (typeof proposal.criterionId === "string") args.push("--criterion-id", proposal.criterionId);
    if (typeof proposal.description === "string") args.push("--description", proposal.description);
    if (typeof proposal.priority === "string") args.push("--priority", proposal.priority);
    const res = this.parse<CreateResult>(this.ts(args), "create");
    if (!res.ok) {
      return { accepted: false, created: false, taskRef: null, errors: res.errors ?? ["E_MISSING_FIELD"] };
    }
    return { accepted: true, created: res.created, taskRef: res.id, errors: [] };
  }

  report(): { entries: ReportEntry[] } {
    const res = this.parse<{ entries?: ReportEntry[] }>(this.ts(["report"]), "report");
    return { entries: res.entries ?? [] };
  }

  transition(taskRef: string, to: TaskStatus): { ok: boolean } {
    // taskstore's lifecycle is verb-based (claim/close/reopen), not a generic
    // --status; map each contract status onto the verb that reaches it, and
    // fail closed on a precondition rejection (E_BAD_TRANSITION) or unknown.
    try {
      let out: string;
      switch (to) {
        case "done":
          out = this.ts(["close", taskRef]);
          break;
        case "cancelled":
          out = this.ts(["close", taskRef, "--reason", "cancelled"]);
          break;
        case "in_progress":
          out = this.ts(["claim", taskRef]);
          break;
        case "open":
          out = this.ts(["reopen", taskRef]);
          break;
        default:
          return { ok: false };
      }
      const res = this.parse<{ ok: boolean }>(out, to);
      return { ok: res.ok === true };
    } catch {
      return { ok: false };
    }
  }
}
