import type { AppNotifyPayload } from "@/lib/realtime/hub";
import { parseOwnerKey } from "@/lib/auth/owner-key";

export function ownerMayReceive(
  ownerKey: string,
  notification: AppNotifyPayload
): boolean {
  const parsed = parseOwnerKey(ownerKey);
  if (!parsed) return false;
  if (notification.ownerUserId != null) {
    return parsed.kind === "user" && parsed.userId === notification.ownerUserId;
  }
  return true;
}
