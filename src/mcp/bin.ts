#!/usr/bin/env node
// felag-mcp — stdio MCP server entry point. Speaks JSON-RPC over stdio; pair it
// with any MCP host (Claude Code: `claude mcp add felag -- felag-mcp`).

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
