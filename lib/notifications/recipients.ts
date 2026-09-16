/**
 * Wer bekommt eine Zeile in der Historie?
 *
 * Bewusst Fan-out beim Schreiben statt einer geteilten Zeile mit Leseregel:
 * damit sind ungelesen-Zähler, Gelesen-Markierung und Pruning je Empfänger
 * einfaches SQL statt einer Filterung über alle Kandidaten bei jedem Aufruf.
 * Die Empfängerzahl ist eine Handvoll, das Duplikat kostet nichts.
 *
 * Rein (keine DB, kein `node:`) — die Kandidatenliste kommt von aussen.
 */
import type { AppNotifyPayload } from "@/lib/realtime/hub";
import { notificationVisibleTo } from "@/lib/realtime/visibility";

export type NotificationCandidate = {
  ownerKey: string;
  userId: number | null;
  modules: readonly string[];
  isAdmin: boolean;
};

export type NotificationRecipient = {
  ownerKey: string;
  userId: number | null;
};

/**
 * Nutzt dieselbe Regel wie SSE und Push (`notificationVisibleTo`), damit die
 * Historie nie etwas enthält, das der Benutzer live nicht sehen durfte — und
 * nie etwas verpasst, das er gesehen hat.
 */
export function resolveNotificationRecipients(
  notification: Pick<AppNotifyPayload, "reason" | "ownerUserId" | "ownerKey">,
  candidates: readonly NotificationCandidate[]
): NotificationRecipient[] {
  const seen = new Set<string>();
  const out: NotificationRecipient[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.ownerKey)) continue;
    if (!notificationVisibleTo(notification, candidate)) continue;
    seen.add(candidate.ownerKey);
    out.push({ ownerKey: candidate.ownerKey, userId: candidate.userId });
  }
  return out;
}
