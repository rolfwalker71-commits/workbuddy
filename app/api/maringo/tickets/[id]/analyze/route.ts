import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { hasOpenAIKey } from "@/lib/ai/client";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listMariImageAttachmentsForAi } from "@/lib/mari/attachments";
import { analyzeMariTicket } from "@/lib/mari/analyze-ticket";
import { parseAnalyzeModuleIds } from "@/lib/mari/analyze-modules";
import { getTicketDetail } from "@/lib/mari/tickets";
import {
  getMariTicketAnalysis,
  upsertMariTicketAnalysis,
} from "@/lib/mari/ticket-analysis-store";
import { recordActivity } from "@/lib/users/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vision + Attachments können länger dauern */
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function parseIssueId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function GET(_request: Request, context: Ctx) {
  return withMariModule(async (auth) => {

  const { id: raw } = await context.params;
  const id = parseIssueId(raw);
  if (id == null) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  const stored = getMariTicketAnalysis(ownerKeyFromAuth(auth), id);
  if (!stored) {
    return NextResponse.json({ stored: false, issueId: id });
  }
  return NextResponse.json({
    stored: true,
    issueId: id,
    analyzedAt: stored.analyzedAt,
    summary: stored.summary,
    analysis: stored.analysis,
    imagesAnalyzed: stored.imagesAnalyzed,
    imageNames: stored.imageNames,
    usage: stored.usage,
    model: stored.model,
    internalNotePostedAt: stored.internalNotePostedAt,
  });
  });
}

export async function POST(_request: Request, context: Ctx) {
  return withMariModule(async (auth) => {
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { id: raw } = await context.params;
  const id = parseIssueId(raw);
  if (id == null) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  let includeImages = false;
  let attachmentIds: number[] | undefined;
  let products: string[] = [];
  try {
    const body = await _request.json();
    if (body && typeof body === "object") {
      if ("includeImages" in body) {
        includeImages = Boolean(
          (body as { includeImages?: unknown }).includeImages
        );
      }
      if ("attachmentIds" in body && Array.isArray((body as { attachmentIds?: unknown }).attachmentIds)) {
        const rawIds = (body as { attachmentIds: unknown[] }).attachmentIds;
        attachmentIds = [
          ...new Set(
            rawIds
              .map((n) => Number(n))
              .filter((n) => Number.isInteger(n) && n > 0)
          ),
        ].slice(0, 6);
      }
      if ("products" in body) {
        products = parseAnalyzeModuleIds(
          (body as { products?: unknown }).products
        );
      }
    }
  } catch {
    includeImages = false;
    attachmentIds = undefined;
    products = [];
  }

  if (!hasOpenAIKey()) {
    return NextResponse.json(
      { error: "Hinterlege deinen OpenAI-Key unter Konto" },
      { status: 400 }
    );
  }

  try {
    const ticket = await getTicketDetail(id);
    let images: Awaited<ReturnType<typeof listMariImageAttachmentsForAi>> = [];
    if (includeImages) {
      try {
        images = await listMariImageAttachmentsForAi(id, {
          maxImages: attachmentIds ? 6 : 4,
          attachmentIds,
        });
      } catch {
        images = [];
      }
    }
    const analysis = await analyzeMariTicket(ticket, {
      images: images.map((img) => ({
        dataUrl: img.dataUrl,
        orgFilename: img.orgFilename,
        mimeType: img.mimeType,
      })),
      products,
    });
    const { imagesAnalyzed, imageNames, usage, ...payload } = analysis;
    const stored = upsertMariTicketAnalysis({
      ownerKey: ownerKeyFromAuth(auth),
      issueId: id,
      analysis: payload,
      imagesAnalyzed,
      imageNames,
      usage,
      model: usage?.model ?? null,
    });
    try {
      recordActivity({
        userId: auth.userId,
        username: auth.username,
        event: "ticket_analysis",
        detail: { issueId: id, ok: true },
      });
    } catch {
      // Logging must never fail analysis.
    }
    return NextResponse.json({
      analysis: payload,
      issueId: id,
      imagesAnalyzed,
      imageNames,
      usage,
      includeImages,
      stored: true,
      analyzedAt: stored.analyzedAt,
      internalNotePostedAt: stored.internalNotePostedAt,
    });
  } catch (err) {
    try {
      recordActivity({
        userId: auth.userId,
        username: auth.username,
        event: "ticket_analysis",
        detail: { issueId: id, ok: false },
      });
    } catch {
      // Logging must never fail analysis.
    }
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message }, { status });
  }
  });
}
