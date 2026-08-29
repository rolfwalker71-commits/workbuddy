import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasMicrosoftMailScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  listMicrosoftMessageAttachments,
  listMicrosoftPdfAttachments,
  listMicrosoftTicketFileAttachments,
} from "@/lib/microsoft/mail-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }
  if (
    userId == null ||
    !isMicrosoftConnected(userId) ||
    !hasMicrosoftMailScope(userId)
  ) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  try {
    const url = new URL(request.url);
    const all = url.searchParams.get("all") === "1";
    if (all) {
      const listed = await listMicrosoftMessageAttachments(userId, id);
      const files = listMicrosoftTicketFileAttachments(listed);
      return NextResponse.json({
        attachments: files.map((a) => ({
          id: a.id,
          name: a.name,
          size: a.size,
          contentType: a.contentType,
          isInline: a.isInline,
          contentId: a.contentId,
        })),
      });
    }
    const pdfs = await listMicrosoftPdfAttachments(userId, id);
    return NextResponse.json({
      attachments: pdfs.map((a) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        contentType: a.contentType,
        alreadyIngested: false,
        documentId: null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
