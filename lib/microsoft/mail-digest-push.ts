/**
 * Gesammelte Meldung über neu eingegangene Mails.
 *
 * Bisher gab es überhaupt kein Hintergrund-Polling für Mail — nur was der
 * Benutzer selbst analysiert hat, landete irgendwo. Dieser Schritt ist der
 * einzige, der die Ruhezeiten selbst prüft: bei Ruhe wird der Wasserstand
 * NICHT vorgerückt, damit die Mails im nächsten Digest auftauchen statt
 * verloren zu gehen.
 */
import { getSetting, setSetting } from "@/lib/db/migrations";
import { listInboxMessagesSince } from "@/lib/microsoft/mail-inbox";
import {
  hasMicrosoftMailScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { listUserMailSenderBlacklistEmails } from "@/lib/mail/sender-blacklist-store";
import { buildMailDigestText } from "@/lib/mail/mail-digest-text";
import { notifyAppChange } from "@/lib/realtime/notify";
import {
  getNotificationPrefsForOwnerKey,
  isReasonEnabled,
} from "@/lib/realtime/prefs";
import { quietHoursSuppressesForUser } from "@/lib/notifications/quiet-hours";
import { createPresenceLookup } from "@/lib/push/dispatch";
import { listActiveUsersWithModule } from "@/lib/users/queries";

/**
 * 9 Minuten, nicht 15: der Scheduler tickt alle 10 Minuten. Ein 15-Minuten-
 * Fenster würde beim 10-Minuten-Tick übersprungen und erst bei 20 Minuten
 * feuern — faktisch alle 20 Minuten. Mit 9 greift jeder Tick, also ~10 Minuten.
 */
export const MAIL_DIGEST_MIN_INTERVAL_MS = 9 * 60 * 1000;
export const MAIL_DIGEST_MAX_FETCH = 50;

function watermarkKey(userId: number): string {
  return `mail_digest_watermark_u${userId}`;
}
function lastRunKey(userId: number): string {
  return `mail_digest_last_run_at_u${userId}`;
}

export type MailDigestSummary = { sent: number; skipped: string };

function dueForRun(userId: number, now: Date): boolean {
  const raw = getSetting(lastRunKey(userId));
  if (!raw) return true;
  const last = new Date(raw).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= MAIL_DIGEST_MIN_INTERVAL_MS;
}

export function listMailDigestUserIds(): number[] {
  return listActiveUsersWithModule("microsoft")
    .filter((user) => isMicrosoftConnected(user.id))
    .filter((user) => hasMicrosoftMailScope(user.id))
    .map((user) => user.id);
}

async function dispatchForUser(
  userId: number,
  now: Date,
  presenceLookup: ReturnType<typeof createPresenceLookup>
): Promise<"sent" | "quiet" | "empty" | "baseline" | "off"> {
  const ownerKey = `user:${userId}`;
  const prefs = getNotificationPrefsForOwnerKey(ownerKey);
  if (!isReasonEnabled(prefs, "microsoft_mail_digest")) return "off";

  const watermark = getSetting(watermarkKey(userId));
  setSetting(lastRunKey(userId), now.toISOString());

  if (!watermark) {
    // Erster Lauf: Wasserstand setzen, nichts melden — sonst käme beim
    // Einschalten der ganze Posteingang als "neu".
    setSetting(watermarkKey(userId), now.toISOString());
    return "baseline";
  }

  const messages = await listInboxMessagesSince(
    userId,
    watermark,
    MAIL_DIGEST_MAX_FETCH
  );
  if (messages.length === 0) {
    setSetting(watermarkKey(userId), now.toISOString());
    return "empty";
  }

  // Neuester Zeitpunkt über ALLE geholten Mails, auch die gefilterten — sonst
  // taucht eine geblockte Absenderin bei jedem Lauf erneut auf.
  const newest = messages.reduce(
    (acc, m) => (m.date && m.date > acc ? m.date : acc),
    watermark
  );

  const blacklist = new Set(
    listUserMailSenderBlacklistEmails(userId).map((e) => e.toLowerCase())
  );
  const relevant = messages
    .filter((m) => m.unread)
    .filter((m) => !blacklist.has((m.from || "").toLowerCase()));

  if (relevant.length === 0) {
    setSetting(watermarkKey(userId), newest);
    return "empty";
  }

  // Ruhezeit: Wasserstand bewusst NICHT vorrücken.
  if (
    quietHoursSuppressesForUser({
      reason: "microsoft_mail_digest",
      window: prefs.quietHours,
      userId,
      presenceLookup,
      now,
    })
  ) {
    return "quiet";
  }

  const { headline, detail } = buildMailDigestText(relevant);
  notifyAppChange({
    domain: "microsoft",
    reason: "microsoft_mail_digest",
    headline,
    detail,
    title: relevant[0]?.subject ?? null,
    href: "/microsoft",
    aiIconUrl: null,
    category: "Outlook",
    meta: null,
    source: "microsoft",
    ownerUserId: userId,
    ownerKey,
    skipWebPush: false,
  });
  setSetting(watermarkKey(userId), newest);
  return "sent";
}

/** Scheduler-Einstieg. Wirft nie. */
export async function maybeDispatchMailDigest(
  now = new Date()
): Promise<MailDigestSummary> {
  const userIds = listMailDigestUserIds().filter((id) => dueForRun(id, now));
  if (userIds.length === 0) return { sent: 0, skipped: "none-due" };

  const presenceLookup = createPresenceLookup(now);
  // Graph ist nicht ALS-gebunden (graphJson nimmt die userId direkt) und hat
  // seine eigene Drossel von 2 gleichzeitigen Aufrufen je Benutzer.
  const results = await Promise.all(
    userIds.map((userId) =>
      dispatchForUser(userId, now, presenceLookup).catch((error) => {
        console.warn("[workbuddy] mail digest user", userId, error);
        return "error" as const;
      })
    )
  );

  const sent = results.filter((r) => r === "sent").length;
  const quiet = results.filter((r) => r === "quiet").length;
  const skipped = quiet > 0 ? `quiet:${quiet}` : `${results.length - sent}`;
  return { sent, skipped };
}
