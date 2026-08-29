import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  appendMariBodyMarker,
  deleteMariCalendarStamp,
  getMariCalendarStamp,
  mariOutlookCategories,
  upsertMariCalendarStamp,
} from "@/lib/mari/calendar-stamp";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { suggestFreeSlotsForDuration } from "@/lib/microsoft/calendar-review";
import {
  createOutlookCalendarEvent,
  deleteOutlookCalendarEvent,
} from "@/lib/microsoft/mail-day-actions";
import { listMicrosoftCalendarsForUser } from "@/lib/microsoft/calendars";
import {
  hasGoogleCalendarEventsWriteScope,
  hasGoogleCalendarScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import { suggestGoogleFreeSlotsForDuration } from "@/lib/google/calendar-review";
import { createGoogleCalendarEvent } from "@/lib/google/calendar-write";
import { listGoogleCalendarsForUser } from "@/lib/google/calendars";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderSchema = z.enum(["microsoft", "google", "auto"]);

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suggest_slots"),
    durationMinutes: z.number().int().min(15).max(240),
    rangeDays: z.number().int().min(1).max(14).optional(),
    provider: ProviderSchema.optional(),
    calendarId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("create"),
    title: z.string().trim().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startHm: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .nullable(),
    endHm: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .nullable(),
    allDay: z.boolean().optional(),
    location: z.string().trim().max(300).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    mariIssueId: z.number().int().positive().optional().nullable(),
    teamsMeeting: z.boolean().optional(),
    provider: ProviderSchema.optional(),
    calendarId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("delete"),
    eventId: z.string().min(1),
    mariIssueId: z.number().int().positive().optional().nullable(),
    calendarId: z.string().min(1).optional(),
  }),
]);

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json({ targets: [] });
  }

  const scopeRaw = new URL(request.url).searchParams.get("provider");
  const scope =
    scopeRaw === "google" || scopeRaw === "microsoft" ? scopeRaw : null;

  const targets: Array<{
    provider: "microsoft" | "google";
    id: string;
    name: string;
    primary: boolean;
  }> = [];

  if (
    scope !== "google" &&
    isMicrosoftConnected(userId) &&
    hasMicrosoftCalendarScope(userId)
  ) {
    try {
      const { calendars } = await listMicrosoftCalendarsForUser(userId);
      const writable = calendars.filter((x) => x.canEdit);
      const pool = writable.filter((x) => x.enabled);
      const use = pool.length > 0 ? pool : writable.filter((x) => x.primary || writable.length === 1);
      for (const c of use.length > 0 ? use : writable.slice(0, 3)) {
        targets.push({
          provider: "microsoft",
          id: c.id,
          name: c.name,
          primary: c.primary,
        });
      }
    } catch {
      /* ignore */
    }
  }
  if (
    scope !== "microsoft" &&
    isGoogleMailConnected(userId) &&
    hasGoogleCalendarScope(userId)
  ) {
    try {
      const { calendars } = await listGoogleCalendarsForUser(userId);
      const writable = calendars.filter((x) => {
        const role = (x.accessRole || "").toLowerCase();
        return !role || role === "owner" || role === "writer";
      });
      const pool = writable.filter((x) => x.enabled);
      const use =
        pool.length > 0
          ? pool
          : writable.filter((x) => x.primary || writable.length === 1);
      for (const c of use.length > 0 ? use : writable.slice(0, 3)) {
        targets.push({
          provider: "google",
          id: c.id,
          name: c.name,
          primary: c.primary,
        });
      }
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ targets });
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Kein Kalender-User." }, { status: 400 });
  }

  const msOk =
    isMicrosoftConnected(userId) && hasMicrosoftCalendarScope(userId);
  const googleOk =
    isGoogleMailConnected(userId) &&
    (hasGoogleCalendarEventsWriteScope(userId) ||
      hasGoogleCalendarScope(userId));

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  if (body.action === "delete") {
    if (!msOk) {
      return NextResponse.json(
        { error: "Microsoft 365 nicht verbunden." },
        { status: 400 }
      );
    }
    const stamp = getMariCalendarStamp(userId, "microsoft", body.eventId);
    if (!stamp) {
      return NextResponse.json(
        { error: "Kein gestempelter Ticket-Termin gefunden." },
        { status: 404 }
      );
    }
    if (
      body.mariIssueId != null &&
      body.mariIssueId > 0 &&
      stamp.issueId !== body.mariIssueId
    ) {
      return NextResponse.json(
        { error: "Termin gehört nicht zu diesem Ticket." },
        { status: 403 }
      );
    }
    try {
      await deleteOutlookCalendarEvent(
        userId,
        stamp.eventId,
        body.calendarId || stamp.calendarId
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Outlook-Termin konnte nicht gelöscht werden.",
        },
        { status: 502 }
      );
    }
    deleteMariCalendarStamp(userId, "microsoft", stamp.eventId);
    return NextResponse.json({
      ok: true,
      eventId: stamp.eventId,
      issueId: stamp.issueId,
    });
  }

  const requested =
    body.provider && body.provider !== "auto" ? body.provider : null;
  const provider: "microsoft" | "google" | null =
    requested === "google"
      ? googleOk
        ? "google"
        : null
      : requested === "microsoft"
        ? msOk
          ? "microsoft"
          : null
        : msOk
          ? "microsoft"
          : googleOk
            ? "google"
            : null;

  if (!provider) {
    return NextResponse.json(
      { error: "Kein Kalender verbunden." },
      { status: 400 }
    );
  }

  try {
    if (body.action === "suggest_slots") {
      const rangeDays = body.rangeDays ?? 7;
      const today = zurichYmd();
      const slots =
        provider === "google"
          ? await suggestGoogleFreeSlotsForDuration(userId, {
              durationMinutes: body.durationMinutes,
              fromToday: true,
              rangeStart: today,
              rangeEnd: addDaysYmd(today, rangeDays),
              maxSlots: 48,
              maxSlotsPerDay: 6,
              request,
            })
          : await suggestFreeSlotsForDuration(userId, {
              durationMinutes: body.durationMinutes,
              fromToday: true,
              rangeStart: today,
              rangeEnd: addDaysYmd(today, rangeDays),
              maxSlots: 48,
              maxSlotsPerDay: 6,
            });
      return NextResponse.json({
        ok: true,
        provider,
        slots,
        durationMinutes: body.durationMinutes,
      });
    }

    const mariIssueId =
      body.mariIssueId != null && body.mariIssueId > 0
        ? body.mariIssueId
        : null;
    const rawNotes = body.notes?.trim() || null;
    const notes = mariIssueId
      ? appendMariBodyMarker(rawNotes, mariIssueId)
      : rawNotes;

    const allDay = Boolean(body.allDay) || !body.startHm;
    if (!allDay && !body.startHm) {
      return NextResponse.json(
        { error: "Startzeit oder ganztägig wählen." },
        { status: 400 }
      );
    }

    if (provider === "google") {
      const calendarId = body.calendarId?.trim() || "primary";
      const created = await createGoogleCalendarEvent(
        userId,
        {
          calendarId,
          title: body.title,
          startDate: body.date,
          startTime: allDay ? null : body.startHm,
          endDate: body.date,
          endTime: allDay ? null : body.endHm,
          allDay,
          location: body.location,
          description: notes,
        },
        request
      );
      return NextResponse.json({
        ok: true,
        provider: "google",
        event: created,
        teamsMeeting: false,
        mariIssueId,
      });
    }

    const created = await createOutlookCalendarEvent(userId, {
      title: body.title,
      date: body.date,
      startTime: allDay ? null : body.startHm,
      endTime: allDay ? null : body.endHm,
      allDay,
      location: body.location,
      notes,
      categories: mariIssueId ? mariOutlookCategories(mariIssueId) : null,
      teamsMeeting: !allDay,
      calendarId: body.calendarId || null,
    });
    if (mariIssueId) {
      upsertMariCalendarStamp({
        userId,
        eventProvider: "microsoft",
        eventId: created.id,
        calendarId: body.calendarId || null,
        issueId: mariIssueId,
        eventDate: body.date,
        startHm: body.startHm,
        endHm: body.endHm,
        title: body.title,
        memo: rawNotes,
      });
    }
    return NextResponse.json({
      ok: true,
      provider: "microsoft",
      event: created,
      teamsMeeting: !allDay,
      mariIssueId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
