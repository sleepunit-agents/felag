// Are the governance acks CURRENT? For each triplet: the ack's criterionHash
// must equal the hash of the COMMITTED criterion with state flipped back to
// proposed (the line as acknowledged). check-triplets.ts only replays the
// embedded snapshot; this checks the committed text hasn't drifted since.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, recordHash } from "../src/canonical.js";
import type { Criterion } from "../src/records.js";

const dir = join(import.meta.dirname, "..", "spec", "felag-core");
const govDir = join(import.meta.dirname, "..", "governance");
const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));

let stale = 0;
for (const f of readdirSync(govDir).filter((f) => f.endsWith(".transition.json"))) {
  const t = JSON.parse(readFileSync(join(govDir, f), "utf8"));
  const c = spec.find((r): r is Criterion => r.record === "criterion" && r.id === t.criterionId);
  if (!c) {
    console.log(`${t.criterionId}: NOT IN SPEC`);
    stale++;
    continue;
  }
  const asProposed = { ...c, state: "proposed" };
  const current = recordHash(asProposed);
  for (const a of t.acknowledgments) {
    const ok = a.criterionHash === current;
    console.log(`${t.criterionId}: ack ${a.criterionHash.slice(7, 19)} vs committed-as-proposed ${current.slice(7, 19)} — ${ok ? "CURRENT" : "STALE"}`);
    if (!ok) stale++;
  }
}
process.exit(stale ? 1 : 0);
