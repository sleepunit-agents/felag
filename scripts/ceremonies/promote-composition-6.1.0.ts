// Ceremony 8: ratify the three composition criteria introduced in felag-core
// 6.1.0 (the dogfood of the composition capability — c-composition). They were
// authored and committed active; this gives them the governance trail they were
// missing by ratifying each through the live promotion protocol — the same
// pattern as promote-nit-cleanup-4.1.0.ts.
//
// For each, in order: snapshot the committed criterion with state flipped to
// proposed (exactly what the committed-as-proposed currency check recomputes),
// ack that hash, run promote(), assert ratified, and write the triplet. The
// criteria are and remain active (re-acking is bookkeeping, not a state change),
// so this script does NOT touch spec.jsonl.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, recordHash } from "../../src/canonical.js";
import { promote } from "../../src/promotion.js";
import type { Criterion, PromotionInput, SpecRecord } from "../../src/records.js";

const dir = join(import.meta.dirname, "..", "..", "spec", "felag-core");
const govDir = join(import.meta.dirname, "..", "..", "governance");
const DATE = "2026-06-16";

const ORDER = ["ac-compose-resolve", "ac-compose-cycle", "ac-compose-unresolved"];

for (const id of ORDER) {
  const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
  const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8"));

  const committed = spec.find((r): r is Criterion => r.record === "criterion" && r.id === id);
  if (!committed) throw new Error(`${id} not found`);
  if (committed.state !== "active") throw new Error(`${id} is ${committed.state}, expected active`);

  // The line as acknowledged: the committed criterion with state proposed. Mutate
  // it in the array fed to promote (lint validates the whole set; a proposed
  // criterion is lint-valid).
  committed.state = "proposed";
  const ackHash = recordHash(committed);
  const all: SpecRecord[] = [...spec, ...fixtures];

  const now = new Date().toISOString();
  const transition = {
    criterionId: id,
    to: "active" as const,
    requestedAt: now,
    requestedBy: "felag project",
    acknowledgments: [
      { implementer: "felag project", decision: "ack" as const, at: now, criterionHash: ackHash },
    ],
  };
  const input: PromotionInput = { asOf: now, spec: all, transition };
  const result = promote(input);
  if (!result.accepted || result.outcome !== "ratified") {
    console.error(JSON.stringify(result, null, 2));
    throw new Error(`${id} did not ratify`);
  }

  const base = join(govDir, `${DATE}-${id}`);
  writeFileSync(`${base}.input.json`, JSON.stringify(input, null, 2) + "\n");
  writeFileSync(`${base}.transition.json`, JSON.stringify(transition, null, 2) + "\n");
  writeFileSync(`${base}.result.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(`${id}: ratified (ack ${ackHash.slice(7, 19)}…)`);
}
console.log("all composition criteria ratified");
