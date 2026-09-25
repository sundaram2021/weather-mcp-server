# weather-mcp-server

A small, production-shaped MCP (Model Context Protocol) server that wraps the free
[Open-Meteo](https://open-meteo.com/) geocoding + forecast APIs (no API key needed for Open-Meteo itself).

Transport: **Streamable HTTP** (the MCP transport for remote servers — this is what lets Claude,
Claude.ai's connector directory, or any other MCP client talk to your server over the internet
once it's deployed).

## Tools exposed

| Tool | Description |
|---|---|
| `geocode_location` | Look up lat/lon + metadata for a place name |
| `get_weather_forecast` | Current conditions + N-day forecast for a lat/lon |
| `get_weather_by_location_name` | Convenience: geocode + forecast in one call |

## Project layout

```
src/
  config.ts      # Server configuration (PORT, API key)
  auth.ts        # Request authentication (Bearer / X-API-Key)
  openMeteo.ts   # Thin client for the Open-Meteo APIs
  server.ts      # MCP server instance
  tools.ts       # Tool registrations (geocode + forecast)
  mcpRouter.ts   # Streamable HTTP transport and session handlers
  index.ts       # Express app setup and server entry point
Dockerfile       # Multi-stage build used for Render deployment
render.yaml      # Render "Blueprint" (infra-as-code) definition
```

## Run locally

```bash
pnpm install
pnpm run build
pnpm start
# server listening on http://localhost:3000, MCP endpoint at POST /mcp
```

Or for hot-reload during development:

```bash
pnpm run dev
```

### Quick manual test with curl

```bash
# 1. Initialize a session
curl -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
# -> copy the "mcp-session-id" response header value

# 2. Send the required "initialized" notification
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <SESSION_ID>" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 3. Call a tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <SESSION_ID>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_weather_by_location_name","arguments":{"name":"Faridabad"}}}'
```

### Easier: use the official MCP Inspector

```bash
pnpm dlx @modelcontextprotocol/inspector
```
Then point it at `http://localhost:3000/mcp` with transport type "Streamable HTTP".

## Deploying to Render

You have two options. Both assume your code is pushed to a GitHub repo (Render deploys from git).

### Option A — Blueprint (render.yaml), recommended
1. Push this project to a GitHub repo.
2. In the Render dashboard: **New > Blueprint**, point it at your repo. Render will read
   `render.yaml` and create the service automatically (Docker runtime, health check wired up).
3. If you want auth, set `WEATHER_MCP_API_KEY` in the service's Environment tab after creation.

### Option B — Manual web service
1. Push this project to GitHub.
2. **New > Web Service** in Render, connect the repo.
3. Runtime: **Docker** (it will detect the `Dockerfile` automatically).
4. Health Check Path: `/healthz`.
5. Deploy. Render assigns a public URL like `https://weather-mcp-server-xxxx.onrender.com`.

Your MCP endpoint will then be:
```
https://<your-service>.onrender.com/mcp
```

### Auth (optional, currently off by default)
Set the `WEATHER_MCP_API_KEY` environment variable on Render. Once set, every request to `/mcp`
must include `Authorization: Bearer <that value>` (or `X-API-Key: <that value>`). Leave it unset
to keep the server open (fine for experimenting, not recommended for anything real).

## Notes on "production-ready"

This covers the basics that matter for a real deployment:
- Multi-stage Docker build (small runtime image, no dev deps in production)
- Health check endpoint Render can poll (`/healthz`)
- Reads `$PORT` from the environment (required by Render)
- Per-request timeout on upstream API calls so a slow/dead upstream can't hang the server
- Optional bearer-token auth, toggled by an env var
- Graceful `SIGTERM` handling

What it deliberately does **not** yet include:
- Rate limiting / abuse protection
- Persistent session storage (sessions live in memory — fine for a single instance;
  if you ever scale to multiple Render instances you'll need a shared store like Redis,
  since the SDK's in-memory transport map won't be visible across instances)
- Structured logging / request tracing
- OAuth (Streamable HTTP supports it if you need it later)
