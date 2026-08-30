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
import {
  getCompanyAiPublic,
  omitPersonalAiAccountPut,
} from "@/lib/ai/company-provider";
import {
  isTeamsModuleEnabled,
  parseTeamsEnabled,
} from "@/lib/microsoft/teams-prefs";
import {
  isTechnikNavEnabled,
  setTechnikNavEnabled,
} from "@/lib/technik/technik-prefs";

function openaiAccountPayload(row: AppUserRow | null) {
  const company = getCompanyAiPublic();
  const hasPersonalOpenaiKey = Boolean(row?.openai_api_key_enc);
  return {
    hasOpenaiKey: company.enabled || hasPersonalOpenaiKey,
    hasPersonalOpenaiKey,
    usingCompanyAi: company.enabled,
    companyModel: company.enabled ? company.model : null,
    openaiModel: row?.openai_model || company.model || "gpt-4o-mini",
    chatProvider: row?.chat_provider || "openai",
    hasChatKey: Boolean(row?.chat_api_key_enc) || company.enabled,
    chatBaseUrl: row?.chat_base_url || "",
    chatModel: row?.chat_model || "",
  };
}

function accountPayload(userId: number) {
  const user = getAppUserPublic(userId);
  const row = getAppUserById(userId);
  return {
    user,
    mari: getMariSettingsPublic(userId),
    openai: openaiAccountPayload(row),
    google: {
      clientId: row?.google_oauth_client_id || "",
      hasGoogleOauthClient: Boolean(row?.google_oauth_client_secret_enc),
    },
    teamsEnabled: parseTeamsEnabled(row?.teams_enabled),
    teamsModuleEnabled: isTeamsModuleEnabled(),
    technikEnabled: isTechnikNavEnabled(userId),
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
  mariEmployeeNumber: z.string().optional().nullable(),
  googleOauthClientId: z.string().optional().nullable(),
  googleOauthClientSecret: z.string().optional(),
  clearGoogleOauthClientSecret: z.boolean().optional(),
  teamsEnabled: z.boolean().optional(),
  technikEnabled: z.boolean().optional(),
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
  return NextResponse.json(accountPayload(userId));
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
    const company = getCompanyAiPublic();
    const { technikEnabled, ...accountPut } = parsed.data;
    updateAppUser(userId, omitPersonalAiAccountPut(accountPut, company.enabled));
    if (technikEnabled !== undefined) {
      setTechnikNavEnabled(userId, technikEnabled);
    }
    return NextResponse.json({ ok: true, ...accountPayload(userId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
