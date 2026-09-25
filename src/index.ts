import express from "express";
import { PORT, API_KEY } from "./config.js";
import { closeAllTransports, mcpRouter } from "./mcpRouter.js";

const app = express();

// Minimal CORS for browser-based MCP clients (Inspector, Claude.ai connectors).
// Must run before express.json so preflights and bad-JSON bodies still get CORS headers.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, X-API-Key, mcp-session-id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: "256kb" }));

// Return clean JSON for malformed bodies instead of Express's default HTML + stack trace.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const status =
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      typeof (err as { status: unknown }).status === "number"
        ? (err as { status: number }).status
        : 400;
    const isJsonParseError =
      typeof err === "object" &&
      err !== null &&
      "type" in err &&
      (err as { type: unknown }).type === "entity.parse.failed";
    if (isJsonParseError || status === 400) {
      if (!res.headersSent) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error: malformed JSON" },
          id: null,
        });
      }
      return;
    }
    next(err as Error);
  }
);

// Render (and most load balancers) periodically hit a health check path.
app.get("/healthz", (_req, res) => res.status(200).send("ok"));
app.get("/", (_req, res) => res.status(200).send("weather-mcp-server is running. MCP endpoint: POST /mcp"));

// MCP Streamable HTTP endpoints
app.use("/mcp", mcpRouter);

const server = app.listen(PORT, () => {
  console.log(`weather-mcp-server listening on port ${PORT}`);
  console.log(API_KEY ? "Auth: enabled (Bearer token required)" : "Auth: disabled (open access)");
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  closeAllTransports();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => console.error("unhandledRejection", err));
