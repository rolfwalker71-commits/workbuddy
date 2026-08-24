import { hashPassword } from "@/lib/auth/password";
import {
  companyUsernameCandidates,
  isAllowedCompanyEmail,
  normalizeLoginEmail,
} from "@/lib/auth/allowed-email";
import { ALL_APP_MODULES } from "@/lib/users/modules";
import {
  createAppUser,
  getAppUserByEmail,
  getAppUserByUsername,
  setUserModules,
  updateAppUser,
  type AppUserRow,
} from "@/lib/users/queries";

/**
 * Find or create the isolated app user for a verified @an-group.one mailbox.
 * Existing rows keep their admin flag and modules; new users get all modules.
 */
export async function findOrProvisionCompanyUser(input: {
  email: string;
  displayName?: string | null;
}): Promise<AppUserRow> {
  const email = normalizeLoginEmail(input.email);
  if (!isAllowedCompanyEmail(email)) {
    throw new Error(
      "Nur Konten mit einer @an-group.one-Adresse dürfen sich anmelden."
    );
  }

  const byEmail = getAppUserByEmail(email);
  if (byEmail) {
    if (!byEmail.active) {
      throw new Error("Dieses Konto ist deaktiviert.");
    }
    const displayName = input.displayName?.trim();
    if (displayName && displayName !== byEmail.display_name) {
      return updateAppUser(byEmail.id, { displayName });
    }
    return byEmail;
  }

  let username: string | null = null;
  for (const candidate of companyUsernameCandidates(email)) {
    const taken = getAppUserByUsername(candidate);
    if (!taken) {
      username = candidate;
      break;
    }
    if (taken.email.trim().toLowerCase() === email) {
      if (!taken.active) {
        throw new Error("Dieses Konto ist deaktiviert.");
      }
      return taken;
    }
  }
  if (!username) {
    username = email;
  }

  const placeholder = await hashPassword(
    `sso:${email}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  );
  const user = createAppUser({
    username,
    email,
    displayName: input.displayName?.trim() || username,
    passwordHash: placeholder,
    active: true,
    isAdmin: false,
  });
  setUserModules(user.id, [...ALL_APP_MODULES]);
  return user;
}
