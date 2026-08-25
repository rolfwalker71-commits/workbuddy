import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getCompanyAiPublic,
  saveCompanyAiSettings,
} from "@/lib/ai/company-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  enabled: z.boolean().optional(),
  kind: z.enum(["openai", "custom"]).optional(),
  apiKey: z.string().optional().nullable(),
  clearApiKey: z.boolean().optional(),
  model: z.string().optional().nullable(),
  baseUrl: z.string().optional().nullable(),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(getCompanyAiPublic());
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
    return NextResponse.json(saveCompanyAiSettings(parsed.data));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
