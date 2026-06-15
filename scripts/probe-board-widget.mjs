/**
 * felag_board MCP-App probe (env-gated: FELAG_WIDGETS). Spawns the stdio MCP
 * server (dist/mcp/bin.js) with FELAG_WIDGETS=1 and confirms the widget wiring:
 *   1. felag_board is listed in tools/list.
 *   2. Calling felag_board returns structuredContent with the StatusModel
 *      (verdict + counts + contracts).
 *   3. Reading ui://felag/board returns the text/html;profile=mcp-app bundle.
 *
 * Mirrors loom's stdio client smoke tests. Throwaway validation, not specced.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';

const root = process.cwd();

const transport = new StdioClientTransport({
  command: 'node',
  args: [join(root, 'dist', 'mcp', 'bin.js')],
  env: { ...process.env, FELAG_WIDGETS: '1' },
});

const client = new Client({ name: 'felag-board-probe', version: '0.0.1' });
await client.connect(transport);

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// 1. tools/list contains felag_board.
const tools = await client.listTools();
const names = tools.tools.map((t) => t.name);
ok(names.includes('felag_board'), `felag_board listed (tools: ${names.length} total)`);

// 2. calling felag_board returns the StatusModel as structuredContent.
const res = await client.callTool({ name: 'felag_board', arguments: {} });
const sc = res.structuredContent;
ok(!!sc, 'felag_board returns structuredContent');
if (sc) {
  ok(typeof sc.verdict === 'string', `  verdict = ${JSON.stringify(sc.verdict)}`);
  ok(sc.counts && typeof sc.counts === 'object', `  counts = ${JSON.stringify(sc.counts)}`);
  ok(Array.isArray(sc.contracts), `  contracts = ${sc.contracts?.length} groups`);
  let total = 0;
  for (const c of sc.contracts ?? []) total += (c.criteria ?? []).length;
  console.log(`      name=${sc.name} version=${sc.version} criteria=${total}`);
  console.log(`      contracts: ${(sc.contracts ?? []).map((c) => `${c.id}(${c.criteria.length})`).join(', ')}`);
}

// 3. reading the ui:// resource returns the mcp-app html bundle.
const resource = await client.readResource({ uri: 'ui://felag/board' });
const part = resource.contents?.[0];
ok(part?.mimeType?.includes('mcp-app'), `  resource mimeType = ${part?.mimeType}`);
ok(typeof part?.text === 'string' && part.text.includes('<!doctype html>'),
  `  resource is html (${part?.text?.length ?? 0} bytes)`);

await client.close();
console.log(failures === 0 ? '\nALL PROBES PASSED' : `\n${failures} PROBE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
