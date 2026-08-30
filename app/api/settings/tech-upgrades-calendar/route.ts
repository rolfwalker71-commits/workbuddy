import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  techUpgradesCalendarPublic,
  writeTechUpgradesCalendarConfig,
} from "@/lib/technik/tech-upgrades-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  mailbox: z.string().optional(),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(techUpgradesCalendarPublic());
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  try {
    if (parsed.data.mailbox !== undefined) {
      writeTechUpgradesCalendarConfig({ mailbox: parsed.data.mailbox });
    }
    return NextResponse.json(techUpgradesCalendarPublic());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
