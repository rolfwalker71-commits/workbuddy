import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { geocodeWeatherPlace } from "@/lib/weather/geocode";
import {
  getWeatherHomeLocation,
  saveWeatherHomeLocation,
  weatherHomePublic,
} from "@/lib/weather/location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  weatherPlace: z.string().min(2).max(160),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für dieses Konto." },
      { status: 400 }
    );
  }
  return NextResponse.json({
    weather: weatherHomePublic(getWeatherHomeLocation(userId)),
  });
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für dieses Konto." },
      { status: 400 }
    );
  }
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ort angeben (mind. 2 Zeichen)." },
      { status: 400 }
    );
  }
  const query = parsed.data.weatherPlace.trim();
  const hit = await geocodeWeatherPlace(query);
  if (!hit) {
    return NextResponse.json(
      { error: "Ort nicht gefunden. Bitte genauer angeben, z. B. «Altdorf UR»." },
      { status: 400 }
    );
  }
  const loc = {
    query,
    label: hit.label,
    lat: hit.lat,
    lon: hit.lon,
  };
  saveWeatherHomeLocation(userId, loc);
  return NextResponse.json({ weather: weatherHomePublic(loc) });
}
