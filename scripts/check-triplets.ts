// Spot-check: every governance triplet reproduces — promote(input) === result.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promote } from "../src/promotion.js";

const govDir = join(import.meta.dirname, "..", "governance");
let bad = 0;
for (const f of readdirSync(govDir).filter((f) => f.endsWith(".input.json"))) {
  const base = f.replace(/\.input\.json$/, "");
  const input = JSON.parse(readFileSync(join(govDir, f), "utf8"));
  const expected = JSON.parse(readFileSync(join(govDir, `${base}.result.json`), "utf8"));
  const ok = JSON.stringify(promote(input)) === JSON.stringify(expected);
  console.log(`${base}: ${ok ? "REPRODUCES" : "MISMATCH"}`);
  if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
