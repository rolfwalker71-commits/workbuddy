import { graphJson } from "@/lib/microsoft/graph";
import {
  appendBookBodyMarker,
  BUDDY_BOOK_CATEGORY,
  mergeOutlookBookCategories,
  type EventBookingRef,
} from "@/lib/mari/event-booking-ref";
import { mergeOutlookCategory } from "@/lib/microsoft/mail-ticket-stamp";
import {
  getMicrosoftEventNotes,
  patchMicrosoftEventNotes,
} from "@/lib/microsoft/patch-event-notes";
import { hasMicrosoftCalendarScope } from "@/lib/microsoft/oauth";

async function ensureBookCategory(userId: number): Promise<void> {
  try {
    const data = await graphJson<{
      value?: Array<{ displayName?: string | null }>;
    }>(userId, "/me/outlook/masterCategories");
    const exists = (data.value || []).some(
      (c) =>
        (c.displayName || "").trim().toLowerCase() ===
        BUDDY_BOOK_CATEGORY.toLowerCase()
    );
    if (exists) return;
    await graphJson(userId, "/me/outlook/masterCategories", {
      method: "POST",
      body: JSON.stringify({
        displayName: BUDDY_BOOK_CATEGORY,
        color: "preset5",
      }),
    });
  } catch {
    /* MailboxSettings often missing — PATCH on the event still works. */
  }
}

/**
 * Persist Kunde/Projekt/Vertrag on the Outlook event (category + body marker).
 * Does not remove ticket categories. Local stamp is the source of truth if Graph fails.
 */
export async function stampMicrosoftEventBooking(
  userId: number,
  eventId: string,
  ref: EventBookingRef
): Promise<{ graph: boolean; error: string | null }> {
  if (!hasMicrosoftCalendarScope(userId)) {
    return { graph: false, error: "Microsoft-Kalender-Recht fehlt." };
  }
  const id = eventId.trim();
  if (!id) return { graph: false, error: "Event-ID fehlt." };

  let graphOk = false;
  let error: string | null = null;
  try {
    await ensureBookCategory(userId);
    const existing = await graphJson<{ categories?: string[] }>(
      userId,
      `/me/events/${encodeURIComponent(id)}?$select=id,categories`
    );
    const withFlag = mergeOutlookCategory(
      existing.categories,
      BUDDY_BOOK_CATEGORY
    ).categories;
    const categories = mergeOutlookBookCategories(withFlag, ref);
    await graphJson(userId, `/me/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ categories }),
    });
    graphOk = true;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  try {
    const notes = await getMicrosoftEventNotes(userId, id);
    const next = appendBookBodyMarker(notes.text, ref);
    if (next !== notes.text) {
      await patchMicrosoftEventNotes(userId, {
        eventId: id,
        notesText: next,
        contentType: notes.contentType,
      });
    }
    graphOk = true;
  } catch (err) {
    if (!error) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return { graph: graphOk, error };
}
