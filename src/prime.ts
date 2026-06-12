// prime — emit the author-class protocols as a vendor-neutral markdown brief
// (spec/felag-core it-author-prime). The emitted document carries every
// protocol item's body VERBATIM: a protocol item is an item with at least one
// criterion whose contractId is c-author. Packaging this brief into any
// harness's native format (skills, system prompts, whatever a vendor calls
// them) is an adapter beyond the seam; the markdown itself names no vendor.

import { validatePrimeOutput } from "./author.js";
import type { Criterion, Item, Preamble, SpecRecord } from "./records.js";

export function emitPrime(spec: SpecRecord[]): string {
  const preamble = spec.find((r): r is Preamble => r.record === "preamble");
  const protocolItemIds = new Set(
    spec
      .filter((r): r is Criterion => r.record === "criterion")
      .filter((c) => c.contractId === "c-author")
      .map((c) => c.itemId),
  );
  const items = spec.filter((r): r is Item => r.record === "item" && protocolItemIds.has(r.id));

  const sections = items.map((i) => `## ${i.title} (\`${i.id}\`)\n\n${i.body}`);

  const doc = [
    `# ${preamble?.name ?? "felag"} — author-class protocols`,
    "",
    `*Emitted by \`prime\` from the committed spec (conformanceVersion ` +
      `${preamble?.conformanceVersion ?? "unknown"}). The protocol bodies below are ` +
      `normative and reproduced verbatim; this framing is not. You — whatever ` +
      `you are: a person, a session, a tool — are about to act as a ` +
      `\`felag/author\` implementation. Your conduct is judgment-verified; ` +
      `every artifact you emit is mechanically verified against the contract. ` +
      `The no-LLM path is always sufficient: hand-write interchange lines and ` +
      `run \`lint\`.*`,
    "",
    ...sections,
    "",
    "---",
    "",
    "*End of protocols. Validate your outputs: `lint` for interchange, the " +
      "author-output/excavate-output formats for authored records, the " +
      "promotion-input format for ratification. Fixtures carry the contract; " +
      "prose carries intent.*",
    "",
  ].join("\n");

  // Self-check: an emitter that fails its own validator is not an emitter.
  const check = validatePrimeOutput({ spec, output: doc });
  if (!check.valid) {
    throw new Error(`prime emitted an invalid document: ${JSON.stringify(check.errors)}`);
  }
  return doc;
}
