import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  geocodeLocation,
  getForecast,
  describeWeatherCode,
} from "./openMeteo.js";

export function registerTools(server: McpServer): void {
  server.registerTool(
    "geocode_location",
    {
      title: "Geocode a place name",
      description:
        "Look up latitude/longitude and metadata for a place name (city, town, etc.) using Open-Meteo's geocoding API.",
      inputSchema: {
        name: z.string().min(1).describe("Place name to search for, e.g. 'Faridabad' or 'Paris'"),
        count: z.number().int().min(1).max(20).optional().describe("Max number of matches to return (default 5)"),
      },
    },
    async ({ name, count }) => {
      const results = await geocodeLocation(name, count ?? 5);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No locations found matching "${name}".` }],
        };
      }
      const lines = results.map(
        (r) =>
          `${r.name}, ${r.admin1 ? r.admin1 + ", " : ""}${r.country} — lat: ${r.latitude}, lon: ${r.longitude}, timezone: ${r.timezone}`
      );
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { results },
      };
    }
  );

  server.registerTool(
    "get_weather_forecast",
    {
      title: "Get weather forecast",
      description:
        "Get current conditions and a daily forecast for a given latitude/longitude using Open-Meteo. Use geocode_location first if you only have a place name.",
      inputSchema: {
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        days: z.number().int().min(1).max(16).optional().describe("Number of forecast days, default 3"),
      },
    },
    async ({ latitude, longitude, days }) => {
      const forecast = await getForecast(latitude, longitude, days ?? 3);
      const current = forecast.current as
        | { temperature_2m: number; weather_code: number; wind_speed_10m: number; relative_humidity_2m: number }
        | undefined;

      let summary = `Forecast for (${forecast.latitude}, ${forecast.longitude}), timezone ${forecast.timezone}.\n`;
      if (current) {
        summary += `Now: ${current.temperature_2m}°C, ${describeWeatherCode(current.weather_code)}, humidity ${current.relative_humidity_2m}%, wind ${current.wind_speed_10m} km/h.\n`;
      }
      const daily = forecast.daily as
        | {
            time: string[];
            weather_code: number[];
            temperature_2m_max: number[];
            temperature_2m_min: number[];
          }
        | undefined;
      if (daily?.time) {
        summary += daily.time
          .map((date, i) => {
            const code = daily.weather_code?.[i];
            const desc = typeof code === "number" ? describeWeatherCode(code) : "unknown";
            const high = daily.temperature_2m_max?.[i] ?? "?";
            const low = daily.temperature_2m_min?.[i] ?? "?";
            return `${date}: ${desc}, high ${high}°C / low ${low}°C`;
          })
          .join("\n");
      }

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: forecast as unknown as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
    "get_weather_by_location_name",
    {
      title: "Get weather by place name",
      description:
        "Convenience tool: geocodes a place name and returns its current weather + forecast in one call.",
      inputSchema: {
        name: z.string().min(1).describe("Place name, e.g. 'Faridabad'"),
        days: z.number().int().min(1).max(16).optional(),
      },
    },
    async ({ name, days }) => {
      const matches = await geocodeLocation(name, 1);
      if (matches.length === 0) {
        return { content: [{ type: "text", text: `No location found matching "${name}".` }] };
      }
      const place = matches[0];
      const forecast = await getForecast(place.latitude, place.longitude, days ?? 3);
      const current = forecast.current as
        | { temperature_2m: number; weather_code: number }
        | undefined;
      const text = `${place.name}, ${place.country}: ${
        current ? `${current.temperature_2m}°C, ${describeWeatherCode(current.weather_code)}` : "no current data"
      }`;
      return {
        content: [{ type: "text", text }],
        structuredContent: { place, forecast },
      };
    }
  );
}
