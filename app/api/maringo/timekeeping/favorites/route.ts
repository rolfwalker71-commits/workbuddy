import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import {
  createMariTimeBookFavorite,
  listMariTimeBookFavorites,
  MariTimeBookFavoriteCreateSchema,
} from "@/lib/mari/time-book-favorites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withMariModule(async (auth) => {
  const ownerKey = ownerKeyFromAuth(auth);
  const favorites = listMariTimeBookFavorites(ownerKey);
  return NextResponse.json({ ok: true, favorites });
  });
}

export async function POST(request: Request) {
  return withMariModule(async (auth) => {
  try {
    const json = await request.json();
    const parsed = MariTimeBookFavoriteCreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ungültige Eingabe." },
        { status: 400 }
      );
    }
    const favorite = createMariTimeBookFavorite(
      ownerKeyFromAuth(auth),
      parsed.data
    );
    return NextResponse.json({ ok: true, favorite });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  });
}
