import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { isPhysicalAgendaLocation } from "@/lib/dashboard/agenda-location";
import { geocodeWeatherPlace } from "@/lib/weather/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!isPhysicalAgendaLocation(q)) {
    return NextResponse.json({ error: "Kein physischer Ort." }, { status: 400 });
  }
  const hit = await geocodeWeatherPlace(q);
  if (!hit) {
    return NextResponse.json({ error: "Ort nicht gefunden." }, { status: 404 });
  }
  const pad = 0.012;
  const bbox = [
    hit.lon - pad,
    hit.lat - pad,
    hit.lon + pad,
    hit.lat + pad,
  ].join(",");
  return NextResponse.json({
    label: hit.label,
    lat: hit.lat,
    lon: hit.lon,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${hit.lat},${hit.lon}`
    )}`,
    embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${hit.lat}%2C${hit.lon}`,
  });
}
