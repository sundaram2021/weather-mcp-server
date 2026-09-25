import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { API_KEY } from "./config.js";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Checks request authorization against WEATHER_MCP_API_KEY.
 * Accepts `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>`.
 * Returns true if authenticated or if auth is disabled (no API_KEY configured).
 */
export function checkAuth(req: Request, res: Response): boolean {
  if (!API_KEY) return true; // auth disabled

  const rawAuthHeader = req.headers["authorization"];
  const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;

  const rawXApiKey = req.headers["x-api-key"];
  const xApiKey = Array.isArray(rawXApiKey) ? rawXApiKey[0] : rawXApiKey;

  const providedKey = bearerToken ?? (typeof xApiKey === "string" ? xApiKey : undefined);

  if (providedKey && safeEqual(providedKey, API_KEY)) return true;

  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized: Invalid or missing API key" },
    id: null,
  });
  return false;
}
