import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { checkAuth } from "./auth.js";
import { buildServer } from "./server.js";

export const mcpRouter = Router();

// Session store: one transport (and one underlying McpServer) per initialized session.
const transports = new Map<string, StreamableHTTPServerTransport>();

function getSessionId(req: Request): string | undefined {
  const rawId = req.headers["mcp-session-id"];
  return Array.isArray(rawId) ? rawId[0] : rawId;
}

mcpRouter.post("/", async (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;

  const sessionId = getSessionId(req);
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports.has(sessionId)) {
    transport = transports.get(sessionId)!;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    const server = buildServer();
    try {
      await server.connect(transport);
    } catch {
      try {
        await transport.close();
      } catch {
        // ignore close errors
      }
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
      return;
    }
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: missing/invalid session" },
      id: null,
    });
    return;
  }

  try {
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

async function handleSessionRequest(req: Request, res: Response) {
  if (!checkAuth(req, res)) return;

  const sessionId = getSessionId(req);
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const transport = transports.get(sessionId)!;
  try {
    await transport.handleRequest(req, res);
  } catch {
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
}

mcpRouter.get("/", handleSessionRequest);
mcpRouter.delete("/", handleSessionRequest);

export function closeAllTransports(): void {
  for (const transport of transports.values()) {
    try {
      void transport.close();
    } catch {
      // ignore close errors during shutdown
    }
  }
  transports.clear();
}
