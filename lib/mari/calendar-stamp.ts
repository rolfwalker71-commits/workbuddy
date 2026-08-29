/**
 * Stamp Outlook events created from Maringo tickets so evening processing
 * can suggest time bookings — owner-scoped per WorkBuddy user.
 */
import { getDb } from "@/lib/db/client";
import { hoursBetweenHm } from "@/lib/mari/event-title-tokens";

export { hoursBetweenHm } from "@/lib/mari/event-title-tokens";

/** Hours-only stamp (no MARI ticket). Never listed as evening suggestion. */
export const HOURS_ONLY_STAMP_ISSUE_ID = 0;

/** Outlook category for any Maringo-origin event. */
export const BUDDY_MARI_CATEGORY = "WorkBuddy/Maringo";

/** Body/description marker (Outlook fallback). */
export const BUDDY_MARI_BODY_MARKER_RE = /\[\[(?:buddy|workbuddy):mari:(\d+)\]\]/i;

export function buddyMariIssueCategory(issueId: number): string {
  return `WorkBuddy/Mari#${issueId}`;
}

export function parseMariIssueIdFromCategories(
  categories: string[] | null | undefined
): number | null {
  for (const c of categories || []) {
    const m = /^(?:Buddy|WorkBuddy)\/Mari#(\d+)$/i.exec(c.trim());
    if (m) return Number(m[1]);
  }
  return null;
}

export function parseMariIssueIdFromBody(
  body: string | null | undefined
): number | null {
  const m = BUDDY_MARI_BODY_MARKER_RE.exec(body || "");
  return m ? Number(m[1]) : null;
}

export function appendMariBodyMarker(
  notes: string | null | undefined,
  issueId: number
): string {
  const base = (notes || "").trim();
  const marker = `[[workbuddy:mari:${issueId}]]`;
  if (base.includes(marker) || /\[\[buddy:mari:\d+\]\]/i.test(base)) return base;
  return base ? `${base}\n\n${marker}` : marker;
}

export function mariOutlookCategories(issueId: number): string[] {
  return [BUDDY_MARI_CATEGORY, buddyMariIssueCategory(issueId)];
}

export type MariCalendarStampStatus = "pending" | "booked" | "dismissed";

export type MariCalendarStamp = {
  userId: number;
  ownerKey: string;
  eventProvider: "microsoft";
  eventId: string;
  calendarId: string | null;
  issueId: number;
  eventDate: string;
  startHm: string | null;
  endHm: string | null;
  title: string;
  memo: string | null;
  hours: number | null;
  hoursBillable: number | null;
  status: MariCalendarStampStatus;
  bookedLineId: number | null;
  cardCode: string | null;
  customerName: string | null;
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
  contractVisible: string | null;
  bookingPinned: boolean;
  seriesKey: string | null;
  createdAt: string;
  updatedAt: string;
};

function ownerKeyForUser(userId: number): string {
  return userId > 0 ? `user:${userId}` : "admin";
}

export function ensureMariCalendarStampsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mari_calendar_stamps (
      user_id INTEGER NOT NULL,
      owner_key TEXT NOT NULL,
      event_provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      calendar_id TEXT,
      issue_id INTEGER NOT NULL,
      event_date TEXT NOT NULL,
      start_hm TEXT,
      end_hm TEXT,
      title TEXT NOT NULL,
      memo TEXT,
      hours REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      booked_line_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, event_provider, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mari_calendar_stamps_owner_pending
      ON mari_calendar_stamps(user_id, status, event_date);
    CREATE INDEX IF NOT EXISTS idx_mari_calendar_stamps_owner_issue
      ON mari_calendar_stamps(user_id, issue_id, event_date);
    CREATE INDEX IF NOT EXISTS idx_mari_calendar_stamps_series
      ON mari_calendar_stamps(user_id, event_provider, series_key);
  `);
  ensureMariCalendarStampBookingColumns(db);
}

function ensureMariCalendarStampBookingColumns(
  db: ReturnType<typeof getDb>
): void {
  const names = new Set(
    (
      db.prepare(`PRAGMA table_info(mari_calendar_stamps)`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name)
  );
  const adds: Array<[string, string]> = [
    ["card_code", "TEXT"],
    ["customer_name", "TEXT"],
    ["project_number", "TEXT"],
    ["project_label", "TEXT"],
    ["contract_id", "INTEGER"],
    ["contract_visible", "TEXT"],
    ["booking_pinned", "INTEGER NOT NULL DEFAULT 0"],
    ["series_key", "TEXT"],
    ["hours_billable", "REAL"],
  ];
  for (const [name, ddl] of adds) {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE mari_calendar_stamps ADD COLUMN ${name} ${ddl}`);
    }
  }
}

function requireUserId(userId: number | null | undefined): number {
  if (userId == null || !Number.isInteger(userId) || userId <= 0) {
    throw new Error("Kalender-Stamps brauchen einen App-User.");
  }
  return userId;
}

export function upsertMariCalendarStamp(input: {
  userId: number;
  eventProvider?: "microsoft";
  eventId: string;
  calendarId?: string | null;
  issueId: number;
  eventDate: string;
  startHm?: string | null;
  endHm?: string | null;
  title: string;
  memo?: string | null;
  hours?: number | null;
}): MariCalendarStamp {
  const userId = requireUserId(input.userId);
  ensureMariCalendarStampsTable();
  const db = getDb();
  const now = new Date().toISOString();
  const hours =
    input.hours ??
    (input.startHm && input.endHm
      ? hoursBetweenHm(input.startHm, input.endHm)
      : null);
  const ownerKey = ownerKeyForUser(userId);
  db.prepare(
    `INSERT INTO mari_calendar_stamps (
      user_id, owner_key, event_provider, event_id, calendar_id, issue_id, event_date,
      start_hm, end_hm, title, memo, hours, status, booked_line_id,
      created_at, updated_at
    ) VALUES (
      @userId, @ownerKey, 'microsoft', @eventId, @calendarId, @issueId, @eventDate,
      @startHm, @endHm, @title, @memo, @hours, 'pending', NULL,
      @now, @now
    )
    ON CONFLICT(user_id, event_provider, event_id) DO UPDATE SET
      calendar_id = excluded.calendar_id,
      issue_id = excluded.issue_id,
      event_date = excluded.event_date,
      start_hm = excluded.start_hm,
      end_hm = excluded.end_hm,
      title = excluded.title,
      memo = excluded.memo,
      hours = excluded.hours,
      owner_key = excluded.owner_key,
      updated_at = excluded.updated_at
    WHERE mari_calendar_stamps.status = 'pending'`
  ).run({
    userId,
    ownerKey,
    eventId: input.eventId,
    calendarId: input.calendarId ?? null,
    issueId: input.issueId,
    eventDate: input.eventDate,
    startHm: input.startHm ?? null,
    endHm: input.endHm ?? null,
    title: input.title.trim() || `Ticket #${input.issueId}`,
    memo: input.memo?.trim() || null,
    hours,
    now,
  });
  return getMariCalendarStamp(userId, "microsoft", input.eventId)!;
}

export function getMariCalendarStamp(
  userId: number,
  eventProvider: "microsoft",
  eventId: string
): MariCalendarStamp | null {
  ensureMariCalendarStampsTable();
  const row = getDb()
    .prepare(
      `SELECT * FROM mari_calendar_stamps
       WHERE user_id = ? AND event_provider = ? AND event_id = ?`
    )
    .get(userId, eventProvider, eventId) as Record<string, unknown> | undefined;
  return row ? mapStampRow(row) : null;
}

/**
 * Recurring: series key first (seriesMasterId / iCalUId), then occurrence id.
 * One overlay save on the series covers later days.
 */
export function getMariCalendarStampForEvent(
  userId: number,
  eventId: string,
  seriesKey?: string | null
): MariCalendarStamp | null {
  requireUserId(userId);
  ensureMariCalendarStampsTable();
  const occurrence = (eventId || "").trim();
  const series = (seriesKey || "").trim();
  if (series) {
    const byId = getMariCalendarStamp(userId, "microsoft", series);
    if (byId) return byId;
    const byCol = getDb()
      .prepare(
        `SELECT * FROM mari_calendar_stamps
         WHERE user_id = ? AND event_provider = 'microsoft' AND series_key = ?
           AND (booking_pinned = 1 OR event_id = ? OR event_id = ?)
         ORDER BY booking_pinned DESC, updated_at DESC
         LIMIT 1`
      )
      .get(userId, series, occurrence, series) as
      | Record<string, unknown>
      | undefined;
    if (byCol) return mapStampRow(byCol);
  }
  if (occurrence && occurrence !== series) {
    return getMariCalendarStamp(userId, "microsoft", occurrence);
  }
  return occurrence ? getMariCalendarStamp(userId, "microsoft", occurrence) : null;
}

function stampHasBookingCodes(stamp: MariCalendarStamp | null): boolean {
  if (!stamp) return false;
  return Boolean(
    (stamp.cardCode || "").trim() ||
      (stamp.customerName || "").trim() ||
      (stamp.projectNumber || "").trim() ||
      (stamp.projectLabel || "").trim() ||
      (stamp.contractVisible || "").trim() ||
      (stamp.contractId != null && stamp.contractId > 0)
  );
}

/**
 * Occurrence booked status + series pin (Kunde/Projekt/Vertrag).
 * A sibling occurrence's booked row never wins.
 */
export function resolveMariCalendarStampForEvent(
  userId: number,
  eventId: string,
  seriesKey?: string | null
): MariCalendarStamp | null {
  requireUserId(userId);
  ensureMariCalendarStampsTable();
  const occurrenceId = (eventId || "").trim();
  const series = (seriesKey || "").trim();
  const occurrence = occurrenceId
    ? getMariCalendarStamp(userId, "microsoft", occurrenceId)
    : null;
  const seriesStamp =
    series && series !== occurrenceId
      ? getMariCalendarStampForEvent(userId, occurrenceId, series)
      : null;
  if (!occurrence && !seriesStamp) return null;
  if (!seriesStamp || occurrence?.eventId === seriesStamp.eventId) {
    return occurrence || seriesStamp;
  }
  const booked = occurrence?.status === "booked" ? occurrence : null;
  const pin = stampHasBookingCodes(occurrence)
    ? occurrence
    : stampHasBookingCodes(seriesStamp)
      ? seriesStamp
      : occurrence || seriesStamp;
  const base = booked || occurrence || seriesStamp;
  return {
    ...base,
    status: booked ? "booked" : base.status,
    hours: booked?.hours ?? base.hours,
    hoursBillable: booked?.hoursBillable ?? base.hoursBillable,
    bookedLineId: booked?.bookedLineId ?? base.bookedLineId,
    cardCode: pin?.cardCode ?? base.cardCode,
    customerName: pin?.customerName ?? base.customerName,
    projectNumber: pin?.projectNumber ?? base.projectNumber,
    projectLabel: pin?.projectLabel ?? base.projectLabel,
    contractId: pin?.contractId ?? base.contractId,
    contractVisible: pin?.contractVisible ?? base.contractVisible,
    bookingPinned: Boolean(pin?.bookingPinned || base.bookingPinned),
    seriesKey: base.seriesKey || seriesStamp.seriesKey || series || null,
  };
}

export function listPendingMariCalendarStamps(
  userId: number,
  opts?: {
    onOrBeforeDate?: string;
    onDate?: string;
  }
): MariCalendarStamp[] {
  requireUserId(userId);
  ensureMariCalendarStampsTable();
  const db = getDb();
  let sql = `SELECT * FROM mari_calendar_stamps WHERE user_id = ? AND status = 'pending' AND issue_id > 0`;
  const params: Array<string | number> = [userId];
  if (opts?.onDate) {
    sql += ` AND event_date = ?`;
    params.push(opts.onDate);
  } else if (opts?.onOrBeforeDate) {
    sql += ` AND event_date <= ?`;
    params.push(opts.onOrBeforeDate);
  }
  sql += ` ORDER BY event_date ASC, start_hm ASC, created_at ASC`;
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapStampRow);
}

export function listMariCalendarStampsForIssue(
  userId: number,
  issueId: number
): MariCalendarStamp[] {
  if (!Number.isInteger(issueId) || issueId <= 0) return [];
  requireUserId(userId);
  ensureMariCalendarStampsTable();
  const rows = getDb()
    .prepare(
      `SELECT * FROM mari_calendar_stamps
       WHERE user_id = ? AND issue_id = ? AND status IN ('pending', 'booked')
       ORDER BY event_date DESC, start_hm DESC, created_at DESC`
    )
    .all(userId, issueId) as Array<Record<string, unknown>>;
  return rows.map(mapStampRow);
}

export function getPrimaryMariCalendarStampForIssue(
  userId: number,
  issueId: number,
  todayYmd: string
): MariCalendarStamp | null {
  const stamps = listMariCalendarStampsForIssue(userId, issueId);
  return pickPrimaryStamp(stamps, todayYmd);
}

function pickPrimaryStamp(
  stamps: MariCalendarStamp[],
  todayYmd: string
): MariCalendarStamp | null {
  if (stamps.length === 0) return null;
  const upcoming = stamps
    .filter((s) => s.eventDate >= todayYmd)
    .sort((a, b) => {
      const d = a.eventDate.localeCompare(b.eventDate);
      if (d !== 0) return d;
      return (a.startHm || "").localeCompare(b.startHm || "");
    });
  return upcoming[0] || stamps[0] || null;
}

export function mapPrimaryMariCalendarStampsByIssueIds(
  userId: number,
  issueIds: number[],
  todayYmd: string
): Record<number, MariCalendarStamp> {
  const ids = [
    ...new Set(issueIds.filter((id) => Number.isInteger(id) && id > 0)),
  ];
  if (ids.length === 0) return {};
  requireUserId(userId);
  ensureMariCalendarStampsTable();
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT * FROM mari_calendar_stamps
       WHERE user_id = ? AND issue_id IN (${placeholders})
         AND status IN ('pending', 'booked')
       ORDER BY event_date DESC, start_hm DESC, created_at DESC`
    )
    .all(userId, ...ids) as Array<Record<string, unknown>>;
  const byIssue = new Map<number, MariCalendarStamp[]>();
  for (const row of rows) {
    const stamp = mapStampRow(row);
    const list = byIssue.get(stamp.issueId) || [];
    list.push(stamp);
    byIssue.set(stamp.issueId, list);
  }
  const out: Record<number, MariCalendarStamp> = {};
  for (const id of ids) {
    const primary = pickPrimaryStamp(byIssue.get(id) || [], todayYmd);
    if (primary) out[id] = primary;
  }
  return out;
}

export function deleteMariCalendarStamp(
  userId: number,
  eventProvider: "microsoft",
  eventId: string
): boolean {
  const uid = requireUserId(userId);
  const id = eventId.trim();
  if (!id) return false;
  ensureMariCalendarStampsTable();
  const result = getDb()
    .prepare(
      `DELETE FROM mari_calendar_stamps
       WHERE user_id = ? AND event_provider = ? AND event_id = ?`
    )
    .run(uid, eventProvider, id);
  return Number(result.changes) > 0;
}

/**
 * After a successful time booking from a calendar event: write or update
 * the stamp as `booked` so the event is not offered again.
 * Ticket events keep their issueId; normal Outlook events use issueId 0.
 */
export function markMariCalendarEventBooked(input: {
  userId: number;
  eventProvider?: "microsoft";
  eventId: string;
  seriesKey?: string | null;
  calendarId?: string | null;
  issueId?: number | null;
  eventDate: string;
  startHm?: string | null;
  endHm?: string | null;
  title: string;
  memo?: string | null;
  hours?: number | null;
  hoursBillable?: number | null;
  bookedLineId?: number | null;
  cardCode?: string | null;
  customerName?: string | null;
  projectNumber?: string | null;
  projectLabel?: string | null;
  contractId?: number | null;
  contractVisible?: string | null;
}): MariCalendarStamp {
  const userId = requireUserId(input.userId);
  ensureMariCalendarStampsTable();
  const db = getDb();
  const now = new Date().toISOString();
  const hours =
    input.hours ??
    (input.startHm && input.endHm
      ? hoursBetweenHm(input.startHm, input.endHm)
      : null);
  const seriesKey =
    (input.seriesKey || "").trim() || (input.eventId || "").trim() || null;
  const occurrence = getMariCalendarStamp(userId, "microsoft", input.eventId);
  const pin = seriesKey
    ? getMariCalendarStampForEvent(userId, input.eventId, seriesKey)
    : occurrence;
  const existing = occurrence || pin;
  const issueId =
    input.issueId != null && input.issueId > 0
      ? input.issueId
      : existing && existing.issueId > 0
        ? existing.issueId
        : HOURS_ONLY_STAMP_ISSUE_ID;
  const ownerKey = ownerKeyForUser(userId);
  const title =
    input.title.trim() ||
    (issueId > 0 ? `Ticket #${issueId}` : "Termin");
  const hoursBillable =
    input.hoursBillable != null && Number.isFinite(input.hoursBillable)
      ? Math.max(0, Number(input.hoursBillable))
      : existing?.hoursBillable ?? hours;
  const pick = (next?: string | null, fallback?: string | null) =>
    (next || "").trim() || (fallback || "").trim() || null;
  db.prepare(
    `INSERT INTO mari_calendar_stamps (
      user_id, owner_key, event_provider, event_id, calendar_id, issue_id, event_date,
      start_hm, end_hm, title, memo, hours, hours_billable, status, booked_line_id,
      card_code, customer_name, project_number, project_label,
      contract_id, contract_visible, booking_pinned, series_key,
      created_at, updated_at
    ) VALUES (
      @userId, @ownerKey, 'microsoft', @eventId, @calendarId, @issueId, @eventDate,
      @startHm, @endHm, @title, @memo, @hours, @hoursBillable, 'booked', @bookedLineId,
      @cardCode, @customerName, @projectNumber, @projectLabel,
      @contractId, @contractVisible, @bookingPinned, @seriesKey,
      @now, @now
    )
    ON CONFLICT(user_id, event_provider, event_id) DO UPDATE SET
      calendar_id = excluded.calendar_id,
      issue_id = CASE
        WHEN mari_calendar_stamps.issue_id > 0 THEN mari_calendar_stamps.issue_id
        ELSE excluded.issue_id
      END,
      event_date = excluded.event_date,
      start_hm = excluded.start_hm,
      end_hm = excluded.end_hm,
      title = excluded.title,
      memo = excluded.memo,
      hours = excluded.hours,
      hours_billable = excluded.hours_billable,
      status = 'booked',
      booked_line_id = COALESCE(excluded.booked_line_id, mari_calendar_stamps.booked_line_id),
      card_code = COALESCE(excluded.card_code, mari_calendar_stamps.card_code),
      customer_name = COALESCE(excluded.customer_name, mari_calendar_stamps.customer_name),
      project_number = COALESCE(excluded.project_number, mari_calendar_stamps.project_number),
      project_label = COALESCE(excluded.project_label, mari_calendar_stamps.project_label),
      contract_id = COALESCE(excluded.contract_id, mari_calendar_stamps.contract_id),
      contract_visible = COALESCE(excluded.contract_visible, mari_calendar_stamps.contract_visible),
      series_key = COALESCE(excluded.series_key, mari_calendar_stamps.series_key),
      owner_key = excluded.owner_key,
      updated_at = excluded.updated_at`
  ).run({
    userId,
    ownerKey,
    eventId: input.eventId,
    calendarId: input.calendarId ?? existing?.calendarId ?? null,
    issueId,
    eventDate: input.eventDate,
    startHm: input.startHm ?? existing?.startHm ?? null,
    endHm: input.endHm ?? existing?.endHm ?? null,
    title,
    memo: input.memo?.trim() || existing?.memo || null,
    hours,
    hoursBillable,
    bookedLineId: input.bookedLineId ?? null,
    cardCode: pick(input.cardCode, existing?.cardCode),
    customerName: pick(input.customerName, existing?.customerName),
    projectNumber: pick(input.projectNumber, existing?.projectNumber),
    projectLabel: pick(input.projectLabel, existing?.projectLabel),
    contractId:
      input.contractId != null && Number.isInteger(input.contractId)
        ? input.contractId
        : existing?.contractId ?? null,
    contractVisible: pick(input.contractVisible, existing?.contractVisible),
    bookingPinned: existing?.bookingPinned ? 1 : 0,
    seriesKey,
    now,
  });
  return getMariCalendarStamp(userId, "microsoft", input.eventId)!;
}

export function updateMariCalendarStampStatus(input: {
  userId: number;
  eventProvider?: "microsoft";
  eventId: string;
  status: MariCalendarStampStatus;
  bookedLineId?: number | null;
}): MariCalendarStamp | null {
  const userId = requireUserId(input.userId);
  ensureMariCalendarStampsTable();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE mari_calendar_stamps
       SET status = @status,
           booked_line_id = COALESCE(@bookedLineId, booked_line_id),
           updated_at = @now
       WHERE user_id = @userId AND event_provider = 'microsoft' AND event_id = @eventId`
    )
    .run({
      userId,
      eventId: input.eventId,
      status: input.status,
      bookedLineId: input.bookedLineId ?? null,
      now,
    });
  return getMariCalendarStamp(userId, "microsoft", input.eventId);
}

/** Pin Kunde/Projekt/Vertrag on the event. Keeps ticket issueId. Not an evening queue. */
export function upsertMariCalendarBookingRef(input: {
  userId: number;
  eventId: string;
  seriesKey?: string | null;
  calendarId?: string | null;
  eventDate: string;
  startHm?: string | null;
  endHm?: string | null;
  title: string;
  cardCode?: string | null;
  customerName?: string | null;
  projectNumber?: string | null;
  projectLabel?: string | null;
  contractId?: number | null;
  contractVisible?: string | null;
}): MariCalendarStamp {
  const userId = requireUserId(input.userId);
  ensureMariCalendarStampsTable();
  const db = getDb();
  const now = new Date().toISOString();
  const ownerKey = ownerKeyForUser(userId);
  const seriesKey =
    (input.seriesKey || "").trim() || (input.eventId || "").trim();
  const stampEventId = seriesKey;
  const existing = getMariCalendarStampForEvent(
    userId,
    input.eventId,
    seriesKey
  );
  const issueId = existing && existing.issueId > 0 ? existing.issueId : HOURS_ONLY_STAMP_ISSUE_ID;
  const hours =
    existing?.hours ??
    (input.startHm && input.endHm
      ? hoursBetweenHm(input.startHm, input.endHm)
      : null);
  db.prepare(
    `INSERT INTO mari_calendar_stamps (
      user_id, owner_key, event_provider, event_id, calendar_id, issue_id, event_date,
      start_hm, end_hm, title, memo, hours, status, booked_line_id,
      card_code, customer_name, project_number, project_label,
      contract_id, contract_visible, booking_pinned, series_key,
      created_at, updated_at
    ) VALUES (
      @userId, @ownerKey, 'microsoft', @eventId, @calendarId, @issueId, @eventDate,
      @startHm, @endHm, @title, @memo, @hours, @status, @bookedLineId,
      @cardCode, @customerName, @projectNumber, @projectLabel,
      @contractId, @contractVisible, 1, @seriesKey,
      @now, @now
    )
    ON CONFLICT(user_id, event_provider, event_id) DO UPDATE SET
      calendar_id = COALESCE(excluded.calendar_id, mari_calendar_stamps.calendar_id),
      issue_id = CASE
        WHEN mari_calendar_stamps.issue_id > 0 THEN mari_calendar_stamps.issue_id
        ELSE excluded.issue_id
      END,
      event_date = excluded.event_date,
      start_hm = COALESCE(excluded.start_hm, mari_calendar_stamps.start_hm),
      end_hm = COALESCE(excluded.end_hm, mari_calendar_stamps.end_hm),
      title = excluded.title,
      card_code = excluded.card_code,
      customer_name = excluded.customer_name,
      project_number = excluded.project_number,
      project_label = excluded.project_label,
      contract_id = excluded.contract_id,
      contract_visible = excluded.contract_visible,
      booking_pinned = 1,
      series_key = excluded.series_key,
      owner_key = excluded.owner_key,
      updated_at = excluded.updated_at`
  ).run({
    userId,
    ownerKey,
    eventId: stampEventId,
    calendarId: input.calendarId ?? existing?.calendarId ?? null,
    issueId,
    eventDate: input.eventDate,
    startHm: input.startHm ?? existing?.startHm ?? null,
    endHm: input.endHm ?? existing?.endHm ?? null,
    title: input.title.trim() || existing?.title || "Termin",
    memo: existing?.memo ?? null,
    hours,
    status: existing?.status || "pending",
    bookedLineId: existing?.bookedLineId ?? null,
    cardCode: input.cardCode?.trim() || null,
    customerName: input.customerName?.trim() || null,
    projectNumber: input.projectNumber?.trim() || null,
    projectLabel: input.projectLabel?.trim() || null,
    contractId:
      input.contractId != null && Number.isInteger(input.contractId)
        ? input.contractId
        : null,
    contractVisible: input.contractVisible?.trim() || null,
    seriesKey,
    now,
  });
  return getMariCalendarStampForEvent(userId, input.eventId, seriesKey)!;
}

function mapStampRow(row: Record<string, unknown>): MariCalendarStamp {
  const userId = Number(row.user_id || 0);
  const contractId =
    row.contract_id == null ? null : Number(row.contract_id);
  return {
    userId,
    ownerKey: String(row.owner_key || ownerKeyForUser(userId)),
    eventProvider: "microsoft",
    eventId: String(row.event_id),
    calendarId: (row.calendar_id as string) || null,
    issueId: Number(row.issue_id),
    eventDate: String(row.event_date),
    startHm: (row.start_hm as string) || null,
    endHm: (row.end_hm as string) || null,
    title: String(row.title || ""),
    memo: (row.memo as string) || null,
    hours: row.hours == null ? null : Number(row.hours),
    hoursBillable:
      row.hours_billable == null ? null : Number(row.hours_billable),
    status: row.status as MariCalendarStampStatus,
    bookedLineId:
      row.booked_line_id == null ? null : Number(row.booked_line_id),
    cardCode: (row.card_code as string) || null,
    customerName: (row.customer_name as string) || null,
    projectNumber: (row.project_number as string) || null,
    projectLabel: (row.project_label as string) || null,
    contractId:
      contractId != null && Number.isInteger(contractId) ? contractId : null,
    contractVisible: (row.contract_visible as string) || null,
    bookingPinned: Number(row.booking_pinned || 0) === 1,
    seriesKey: (row.series_key as string) || null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
