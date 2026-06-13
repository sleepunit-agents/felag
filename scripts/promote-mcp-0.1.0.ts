// Ceremony 6: ratify the ten behavioral c-mcp criteria through the live
// promotion protocol. For each, in order: snapshot the record set with the
// target still proposed, evaluate promote(), assert ratified, write the
// governance triplet, then apply the activation (the caller's write, as
// it-author-promotion prescribes). Re-reading the files each iteration so each
// ratification snapshots the prior ones as already-active.
//
// The descriptive seam ac-mcp-adapter-thinness is NOT promoted — descriptive is
// terminal and inert, reached by an ordinary edit, never a ratification event.
//
// Governance triplets land under spec/felag-mcp/governance/ (co-located with the
// spec they ratify), keeping each conformance unit's governance self-contained
// rather than pooling into felag-core's governance/ dir.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, serialize, recordHash } from "../src/canonical.js";
import { promote } from "../src/promotion.js";
import type { Criterion, PromotionInput, SpecRecord } from "../src/records.js";

const dir = join(import.meta.dirname, "..", "spec", "felag-mcp");
const govDir = join(dir, "governance");
mkdirSync(govDir, { recursive: true });
const DATE = "2026-06-13";

const ORDER = [
  "ac-mcp-envelope-ok",
  "ac-mcp-unknown-tool",
  "ac-mcp-totality",
  "ac-mcp-bad-input",
  "ac-mcp-inline-wins",
  "ac-mcp-path-load",
  "ac-mcp-path-parse-error",
  "ac-mcp-channel-isolation",
  "ac-mcp-no-source",
  "ac-mcp-spec-not-found",
  "ac-mcp-lint-orphans",
  "ac-mcp-hash-shape",
  "ac-mcp-fmt-roundtrip",
];

for (const criterionId of ORDER) {
  const spec = parse(readFileSync(join(dir, "spec.jsonl"), "utf8"));
  const fixtures = parse(readFileSync(join(dir, "fixtures.jsonl"), "utf8"));
  const all: SpecRecord[] = [...spec, ...fixtures];

  const criterion = spec.find((r): r is Criterion => r.record === "criterion" && r.id === criterionId);
  if (!criterion) throw new Error(`${criterionId} not found`);
  if (criterion.state !== "proposed") throw new Error(`${criterionId} is ${criterion.state}, not proposed`);

  const now = new Date().toISOString();
  const transition = {
    criterionId,
    to: "active" as const,
    requestedAt: now,
    requestedBy: "felag project",
    acknowledgments: [
      { implementer: "felag project", decision: "ack" as const, at: now, criterionHash: recordHash(criterion) },
    ],
  };
  const input: PromotionInput = { asOf: now, spec: all, transition };
  const result = promote(input);
  if (!result.accepted || result.outcome !== "ratified") {
    console.error(JSON.stringify(result, null, 2));
    throw new Error(`${criterionId} did not ratify`);
  }

  const base = join(govDir, `${DATE}-${criterionId}`);
  writeFileSync(`${base}.input.json`, JSON.stringify(input, null, 2) + "\n");
  writeFileSync(`${base}.transition.json`, JSON.stringify(transition, null, 2) + "\n");
  writeFileSync(`${base}.result.json`, JSON.stringify(result, null, 2) + "\n");

  // The caller's write: apply the activation to the interchange.
  criterion.state = "active";
  writeFileSync(join(dir, "spec.jsonl"), serialize(spec));
  console.log(`${criterionId}: ratified (${recordHash(criterion).slice(0, 20)}…) and activated`);
}
console.log(`all ${ORDER.length} ratified`);
