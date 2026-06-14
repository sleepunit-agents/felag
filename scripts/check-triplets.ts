// Spot-check: every governance triplet reproduces — promote(input) === result.
// Walks the core governance/ dir AND every sibling spec's spec/<name>/governance/
// (the felag-mcp triplets used to escape this check entirely).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promote } from "../src/promotion.js";

const root = join(import.meta.dirname, "..");
const govDirs = [join(root, "governance")];
const specRoot = join(root, "spec");
if (existsSync(specRoot)) {
  for (const name of readdirSync(specRoot)) {
    const g = join(specRoot, name, "governance");
    if (existsSync(g)) govDirs.push(g);
  }
}

let bad = 0;
let total = 0;
for (const govDir of govDirs) {
  for (const f of readdirSync(govDir).filter((f) => f.endsWith(".input.json"))) {
    const base = f.replace(/\.input\.json$/, "");
    const input = JSON.parse(readFileSync(join(govDir, f), "utf8"));
    const expected = JSON.parse(readFileSync(join(govDir, `${base}.result.json`), "utf8"));
    const ok = JSON.stringify(promote(input)) === JSON.stringify(expected);
    console.log(`${base}: ${ok ? "REPRODUCES" : "MISMATCH"}`);
    if (!ok) bad++;
    total++;
  }
}
console.log(`\n${total - bad}/${total} triplets reproduce across ${govDirs.length} governance dir(s)`);
process.exit(bad ? 1 : 0);
