import { saveUserAvatarUpload } from "@/lib/users/avatar";
import { getAppUserById } from "@/lib/users/queries";
import {
  getMicrosoftAccessToken,
  readMicrosoftUserTokens,
} from "@/lib/microsoft/oauth";

/** Fetch Graph profile photo and store as user avatar. No-op if none. */
export async function syncMicrosoftProfilePhoto(
  userId: number
): Promise<boolean> {
  let token: string;
  try {
    token = await getMicrosoftAccessToken(userId);
  } catch {
    return false;
  }
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/photo/$value",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 32) return false;
  await saveUserAvatarUpload(userId, buf);
  return true;
}

/** If the user has M365 but no stored avatar, pull Graph photo once. */
export async function ensureMicrosoftAvatar(
  userId: number
): Promise<void> {
  const user = getAppUserById(userId);
  if (!user || user.avatar_path) return;
  if (!readMicrosoftUserTokens(userId)?.refreshToken) return;
  try {
    await syncMicrosoftProfilePhoto(userId);
  } catch {
    /* Graph 404 / missing photo is normal */
  }
}
