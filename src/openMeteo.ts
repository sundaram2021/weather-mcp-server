const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// Simple fetch wrapper with a timeout so a slow upstream never hangs a tool call forever.
async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Upstream request failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface GeocodeResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
  timezone: string;
  population?: number;
}

interface GeocodeResponse {
  results?: GeocodeResult[];
}

export async function geocodeLocation(
  name: string,
  count = 5
): Promise<GeocodeResult[]> {
  const safeCount = Math.min(Math.max(Math.trunc(count) || 5, 1), 20);
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(name)}&count=${safeCount}&language=en&format=json`;
  const data = await fetchJson<GeocodeResponse>(url);
  return data.results ?? [];
}

export interface ForecastResult {
  latitude: number;
  longitude: number;
  timezone: string;
  current?: Record<string, unknown>;
  daily?: Record<string, unknown[]>;
}

export async function getForecast(
  latitude: number,
  longitude: number,
  days: number
): Promise<ForecastResult> {
  const safeDays = Math.min(Math.max(Math.trunc(days) || 3, 1), 16);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
    forecast_days: String(safeDays),
    timezone: "auto",
  });
  const url = `${FORECAST_URL}?${params.toString()}`;
  return fetchJson<ForecastResult>(url);
}

// Minimal WMO weather code -> human description map (used to make tool output readable).
const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function describeWeatherCode(code: number): string {
  return WEATHER_CODES[code] ?? `Unknown weather code (${code})`;
}
