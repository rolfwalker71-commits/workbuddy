import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { hashPassword, verifyPasswordHash } from "@/lib/auth/password";
import { ensureInitialized } from "@/lib/db/migrations";
import { getAppUserById, updateAppUser } from "@/lib/users/queries";
import { resolveAppUserId } from "@/lib/users/resolve-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (auth.kind === "admin") {
    return NextResponse.json(
      {
        error:
          "Das Env-Admin-Passwort steht in der Server-Umgebung, nicht unter Konto.",
      },
      { status: 400 }
    );
  }
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für dieses Konto." },
      { status: 400 }
    );
  }
  const parsed = PostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Aktuelles Passwort und neues Passwort (min. 6 Zeichen)." },
      { status: 400 }
    );
  }
  const user = getAppUserById(userId);
  if (!user) {
    return NextResponse.json(
      { error: "Benutzer nicht gefunden." },
      { status: 404 }
    );
  }
  const currentOk = await verifyPasswordHash(
    parsed.data.currentPassword,
    user.password_hash
  );
  if (!currentOk) {
    return NextResponse.json(
      { error: "Aktuelles Passwort ist falsch." },
      { status: 400 }
    );
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return NextResponse.json(
      { error: "Neues Passwort muss sich vom aktuellen unterscheiden." },
      { status: 400 }
    );
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  updateAppUser(userId, { passwordHash });
  return NextResponse.json({ ok: true });
}
