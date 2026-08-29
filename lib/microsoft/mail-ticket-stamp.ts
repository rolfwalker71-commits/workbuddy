import { graphJson } from "@/lib/microsoft/graph";

/** Outlook-Kategorie nach erfolgreichem MARI-Import. */
export const MAIL_TICKET_IMPORT_CATEGORY = "Import als Ticket";

export function mergeOutlookCategory(
  existing: string[] | null | undefined,
  add: string
): { categories: string[]; added: boolean } {
  const label = add.trim();
  const categories = (existing || [])
    .map((c) => c.trim())
    .filter(Boolean);
  const has = categories.some(
    (c) => c.toLowerCase() === label.toLowerCase()
  );
  if (!has && label) categories.push(label);
  return { categories, added: Boolean(label) && !has };
}

async function ensureOutlookMasterCategory(
  userId: number,
  displayName: string
): Promise<void> {
  try {
    const data = await graphJson<{
      value?: Array<{ displayName?: string | null }>;
    }>(userId, "/me/outlook/masterCategories");
    const exists = (data.value || []).some(
      (c) =>
        (c.displayName || "").trim().toLowerCase() ===
        displayName.toLowerCase()
    );
    if (exists) return;
    await graphJson(userId, "/me/outlook/masterCategories", {
      method: "POST",
      body: JSON.stringify({
        displayName,
        color: "preset9",
      }),
    });
  } catch {
    /* MailboxSettings oft nicht im Token — PATCH der Mail reicht. */
  }
}

/**
 * Stempel «Import als Ticket» auf die Outlook-Mail (Kategorie, andere bleiben).
 * Nur nach erfolgreichem MARI-POST aufrufen.
 */
export async function stampMicrosoftMailAsTicketImport(
  userId: number,
  messageId: string
): Promise<{ category: string; added: boolean }> {
  const id = messageId.trim();
  if (!id) {
    throw new Error("Mail-ID fehlt.");
  }
  await ensureOutlookMasterCategory(userId, MAIL_TICKET_IMPORT_CATEGORY);
  const existing = await graphJson<{ categories?: string[] }>(
    userId,
    `/me/messages/${encodeURIComponent(id)}?$select=id,categories`
  );
  const { categories, added } = mergeOutlookCategory(
    existing.categories,
    MAIL_TICKET_IMPORT_CATEGORY
  );
  if (added) {
    await graphJson(userId, `/me/messages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ categories }),
    });
  }
  return { category: MAIL_TICKET_IMPORT_CATEGORY, added };
}
