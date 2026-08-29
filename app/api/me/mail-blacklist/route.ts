import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { SYSTEM_MAIL_HIDE_NOTE } from "@/lib/mail/sender-blacklist";
import {
  addUserMailSenderBlacklist,
  getUserMailSenderBlacklist,
  removeUserMailSenderBlacklist,
} from "@/lib/mail/sender-blacklist-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddSchema = z.object({
  email: z.string().min(3).max(320),
  name: z.string().max(160).optional().nullable(),
});

function noAppUser() {
  return NextResponse.json(
    { error: "Kein App-User für dieses Konto." },
    { status: 400 }
  );
}

function payload(userId: number) {
  return {
    entries: getUserMailSenderBlacklist(userId),
    systemNote: SYSTEM_MAIL_HIDE_NOTE,
  };
}

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) return noAppUser();
  return NextResponse.json(payload(userId));
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) return noAppUser();
  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  try {
    addUserMailSenderBlacklist(userId, {
      email: parsed.data.email,
      name: parsed.data.name ?? null,
    });
    return NextResponse.json({ ok: true, ...payload(userId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) return noAppUser();
  const url = new URL(request.url);
  const email =
    url.searchParams.get("email") ||
    ((await request.json().catch(() => null)) as { email?: string } | null)
      ?.email ||
    "";
  if (!email.trim()) {
    return NextResponse.json({ error: "E-Mail fehlt" }, { status: 400 });
  }
  try {
    removeUserMailSenderBlacklist(userId, email);
    return NextResponse.json({ ok: true, ...payload(userId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
