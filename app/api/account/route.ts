import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getMariSettingsPublic } from "@/lib/mari/settings";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import {
  getAppUserById,
  getAppUserPublic,
  updateAppUser,
  type AppUserRow,
} from "@/lib/users/queries";
import { getCompanyAiPublic } from "@/lib/ai/company-provider";

function openaiAccountPayload(row: AppUserRow | null) {
  const company = getCompanyAiPublic();
  const hasPersonalOpenaiKey = Boolean(row?.openai_api_key_enc);
  return {
    hasOpenaiKey: hasPersonalOpenaiKey || company.enabled,
    hasPersonalOpenaiKey,
    usingCompanyAi: !hasPersonalOpenaiKey && company.enabled,
    companyModel: company.enabled ? company.model : null,
    openaiModel: row?.openai_model || company.model || "gpt-4o-mini",
    chatProvider: row?.chat_provider || "openai",
    hasChatKey: Boolean(row?.chat_api_key_enc) || company.enabled,
    chatBaseUrl: row?.chat_base_url || "",
    chatModel: row?.chat_model || "",
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  openaiApiKey: z.string().optional(),
  clearOpenaiApiKey: z.boolean().optional(),
  openaiModel: z.string().optional().nullable(),
  chatProvider: z.enum(["openai", "deepseek", "custom"]).optional().nullable(),
  chatApiKey: z.string().optional(),
  clearChatApiKey: z.boolean().optional(),
  chatBaseUrl: z.string().optional().nullable(),
  chatModel: z.string().optional().nullable(),
  mariRestUsername: z.string().optional().nullable(),
  mariRestPassword: z.string().optional(),
  clearMariRestPassword: z.boolean().optional(),
  mariEmployeeNumber: z.string().optional().nullable(),
  googleOauthClientId: z.string().optional().nullable(),
  googleOauthClientSecret: z.string().optional(),
  clearGoogleOauthClientSecret: z.boolean().optional(),
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
  const user = getAppUserPublic(userId);
  const row = getAppUserById(userId);
  return NextResponse.json({
    user,
    mari: getMariSettingsPublic(userId),
    openai: openaiAccountPayload(row),
    google: {
      clientId: row?.google_oauth_client_id || "",
      hasGoogleOauthClient: Boolean(row?.google_oauth_client_secret_enc),
    },
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
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  try {
    updateAppUser(userId, parsed.data);
    return NextResponse.json({ ok: true, ...(await (async () => {
      const row = getAppUserById(userId);
      return {
        user: getAppUserPublic(userId),
        mari: getMariSettingsPublic(userId),
        openai: openaiAccountPayload(row),
        google: {
          clientId: row?.google_oauth_client_id || "",
          hasGoogleOauthClient: Boolean(row?.google_oauth_client_secret_enc),
        },
      };
    })()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
