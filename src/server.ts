import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "weather-mcp-server",
    version: "0.0.1",
  });

  registerTools(server);

  return server;
}
