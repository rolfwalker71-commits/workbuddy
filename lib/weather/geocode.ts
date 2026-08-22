export type GeocodedPlace = {
  label: string;
  lat: number;
  lon: number;
};

export async function geocodeWeatherPlace(
  query: string
): Promise<GeocodedPlace | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "WorkBuddy/1.0 (https://github.com/rolfwalker71-commits/workbuddy)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    lat?: string;
    lon?: string;
    name?: string;
    display_name?: string;
    address?: { city?: string; town?: string; village?: string; municipality?: string };
  }>;
  const hit = rows[0];
  const lat = Number(hit?.lat);
  const lon = Number(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const label =
    hit.address?.city ||
    hit.address?.town ||
    hit.address?.village ||
    hit.address?.municipality ||
    hit.name ||
    q.split(",")[0]!.trim();
  return { label, lat, lon };
}
