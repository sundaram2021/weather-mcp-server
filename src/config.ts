// Load .env automatically if present using Node's built-in env loader
try {
  process.loadEnvFile();
} catch {
  // .env file not present or not readable; fall back to process.env
}

const parsedPort = Number(process.env.PORT);
export const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

// Optional shared-secret auth. Set WEATHER_MCP_API_KEY in .env or environment to enable auth.
const rawKey = process.env.WEATHER_MCP_API_KEY?.trim();
export const API_KEY = rawKey ? rawKey : undefined;
