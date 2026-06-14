// Ceremony 7 (t-16): re-ratify the three active criteria that gained a fixture
// in 4.1.0. Adding a fixture changes a criterion's record hash, which stales
// the ack on its governance triplet (the ack binds to the line as
// acknowledged — gov README "Amendments", and conformance.test "governance
// acks are current"). The fix is the same one ac-int-payload-number used when
// its gherkin was amended: re-ratify the amended line through the live
// promotion protocol and keep only the final triplet.
//
// The criteria are and remain active (they never stopped gating — re-acking is
// bookkeeping, not a state change), so this script does NOT touch spec.jsonl.
// For each, it snapshots the committed criterion with state flipped to
// proposed (exactly what the committed-as-proposed currency check recomputes),
// acks that hash, runs promote(), asserts ratified, and writes the triplet.
// Superseded earlier-dated triplets are removed (only the final triplet is
// kept; history lives in git).

import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse, recordHash } from "../src/canonical.js";
import { promote } from "../src/promotion.js";
import type { Criterion, PromotionInput, SpecRecord } from "../src/records.js";

const dir = join(import.meta.dirname, "..", "spec", "felag-core");
const govDir = join(import.meta.dirname, "..", "governance");
const DATE = "2026-06-13";

// Each entry: the criterion to re-ratify, and any superseded triplet date to
// remove (the 4.0.0-era triplet whose ack is now stale).
const TARGETS: { id: string; supersedes?: string }[] = [
  { id: "ac-gate-graduated", supersedes: "2026-06-12" },
  { id: "ac-grad-admissibility", supersedes: "2026-06-12" },
  { id: "ac-gate-descriptive" }, // its triplet is already 2026-06-13 → overwritten
];

for (const { id, supersedes } of TARGETS) {
  const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
  const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8"));

  const committed = spec.find((r): r is Criterion => r.record === "criterion" && r.id === id);
  if (!committed) throw new Error(`${id} not found`);
  if (committed.state !== "active") throw new Error(`${id} is ${committed.state}, expected active`);

  // The line as acknowledged: the committed criterion with state proposed.
  // Mutate it in the array we feed to promote (G2 lints the whole set; a
  // proposed criterion is lint-valid).
  committed.state = "proposed";
  const asProposed = committed;
  const ackHash = recordHash(asProposed);
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

  if (supersedes) {
    for (const suffix of ["input", "transition", "result"]) {
      const stale = join(govDir, `${supersedes}-${id}.${suffix}.json`);
      if (existsSync(stale)) rmSync(stale);
    }
  }
  console.log(`${id}: re-ratified (ack ${ackHash.slice(7, 19)}…)${supersedes ? `, removed ${supersedes} triplet` : ""}`);
}
console.log("all re-ratified");
