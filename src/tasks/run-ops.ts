// The op-sequence runner — the Binding for felag-tasks/op-sequence@0 fixtures.
// Executes ops against a TaskStore and normalizes taskRefs to $-tokens by
// order of first appearance (it-tasks-model), so fixture comparison is
// mechanical across implementations.

import { TaskStore, type TaskStatus } from "./store.js";
import type { WorkLayer } from "./layer.js";

export interface Op {
  op: "propose" | "report" | "transition";
  proposal?: Record<string, unknown>;
  taskRef?: string;
  to?: string;
}

export function runOps(ops: Op[], layer?: WorkLayer): unknown[] {
  const store: WorkLayer = layer ?? new TaskStore();
  const refToToken = new Map<string, string>();
  const tokenToRef = new Map<string, string>();

  const tokenize = (ref: string | null): string | null => {
    if (ref === null) return null;
    if (!refToToken.has(ref)) {
      const token = `$${refToToken.size + 1}`;
      refToToken.set(ref, token);
      tokenToRef.set(token, ref);
    }
    return refToToken.get(ref)!;
  };

  const results: unknown[] = [];
  for (const op of ops) {
    switch (op.op) {
      case "propose": {
        const r = store.propose(op.proposal ?? {});
        results.push({ ...r, taskRef: tokenize(r.taskRef) });
        break;
      }
      case "report": {
        const r = store.report();
        results.push({
          entries: r.entries.map((e) => ({ ...e, taskRef: tokenize(e.taskRef)! })),
        });
        break;
      }
      case "transition": {
        // Fixture inputs reference tasks by token; map back to the live ref.
        const ref = tokenToRef.get(op.taskRef ?? "") ?? op.taskRef ?? "";
        results.push(store.transition(ref, op.to as TaskStatus));
        break;
      }
    }
  }
  return results;
}
