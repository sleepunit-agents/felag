// Smoke test: spawn the built felag-mcp server over stdio with a real MCP
// client, list tools, and round-trip a real call (felag_lint on spec/felag-core
// must return valid:true). Not a conformance test — proof the transport binding
// actually starts and answers.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const transport = new StdioClientTransport({
  command: "node",
  args: [join(root, "dist", "mcp", "bin.js")],
  cwd: root,
});
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
const names = tools.tools.map((t) => t.name).sort();
console.log(`tools/list: ${names.length} tools`);
const expected = [
  "felag_audit", "felag_fmt", "felag_graduate", "felag_hash", "felag_lint",
  "felag_prime", "felag_promote", "felag_render", "felag_validate_author",
  "felag_validate_excavate", "felag_validate_prime", "felag_verify",
];
if (JSON.stringify(names) !== JSON.stringify(expected)) {
  throw new Error(`tool set mismatch: ${names.join(", ")}`);
}

// Round-trip: felag_lint on the committed felag-core spec (by path).
const lintRes = await client.callTool({ name: "felag_lint", arguments: { specDir: "spec/felag-core" } });
const lintText = (lintRes.content as { type: string; text: string }[])[0].text;
const lint = JSON.parse(lintText);
console.log(`felag_lint spec/felag-core -> valid=${lint.valid}, errors=${lint.errors.length}, orphans=${lint.orphanFixtures.length}`);
if (lint.valid !== true) throw new Error(`expected valid:true, got ${lintText}`);

// Round-trip an error case: felag_lint with no source must come back isError.
const errRes = await client.callTool({ name: "felag_lint", arguments: {} });
const errBody = JSON.parse((errRes.content as { type: string; text: string }[])[0].text);
console.log(`felag_lint {} -> isError=${errRes.isError}, error=${errBody.error}`);
if (errRes.isError !== true || errBody.error !== "E_NO_SPEC_SOURCE") {
  throw new Error(`expected E_NO_SPEC_SOURCE isError, got ${JSON.stringify(errBody)}`);
}

// Round-trip prime (a string-result pass-through).
const primeRes = await client.callTool({ name: "felag_prime", arguments: { specDir: "spec/felag-core" } });
const primeText = (primeRes.content as { type: string; text: string }[])[0].text;
console.log(`felag_prime spec/felag-core -> ${primeText.length} chars, starts: ${JSON.stringify(primeText.slice(0, 40))}`);
if (!primeText.includes("author-class protocols")) throw new Error("prime output missing expected heading");

await client.close();
console.log("SMOKE OK");
