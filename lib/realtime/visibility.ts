/**
 * Wer darf eine Benachrichtigung sehen?
 *
 * Bis hierher galt die Regel nur im Push-Pfad (`lib/push/owner-filter.ts`).
 * Der SSE-Stream schickte dagegen jedes Ereignis an jeden angemeldeten Client,
 * sodass Kollegen gegenseitig ihre Ticket-Meldungen samt Betreff sahen. Diese
 * Datei ist die gemeinsame Regel für SSE, Push und die gespeicherte Historie —
 * drei Wege, eine Definition.
 *
 * Rein (kein `node:`, keine DB), damit sie auch aus einer Client-Komponente
 * importiert werden kann.
 */
import type { AppNotifyPayload } from "@/lib/realtime/hub";
import { parseOwnerKey } from "@/lib/auth/owner-key";
import { notifyReasonVisibleForModules } from "@/lib/realtime/reason-catalog";

export type NotifyViewer = {
  /** `null` für den env-Admin (owner_key "admin"). */
  userId: number | null;
  modules: readonly string[];
  isAdmin: boolean;
};

export function notificationVisibleTo(
  notification: Pick<
    AppNotifyPayload,
    "reason" | "ownerUserId" | "ownerKey"
  >,
  viewer: NotifyViewer
): boolean {
  // Besitz schlägt alles — auch Admins. `ownerMayReceive` entscheidet im
  // Push-Pfad genauso; würden die beiden hier auseinanderlaufen, bekäme ein
  // Admin einen Toast ohne die dazugehörige Push (oder umgekehrt).
  if (notification.ownerUserId != null) {
    return viewer.userId === notification.ownerUserId;
  }

  if (notification.ownerKey) {
    const parsed = parseOwnerKey(notification.ownerKey);
    if (parsed?.kind === "user") return viewer.userId === parsed.userId;
    if (parsed?.kind === "admin") return viewer.isAdmin;
  }

  // Unbesessene Meldung: nur noch die Modul-Ebene entscheidet.
  return notifyReasonVisibleForModules(
    notification.reason,
    viewer.modules,
    viewer.isAdmin
  );
}
