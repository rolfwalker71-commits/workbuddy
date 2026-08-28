import type { UserOrganization } from "@/lib/users/organization";

export type PresenceActor = {
  isAdmin: boolean;
  canManagePresence: boolean;
  organization: UserOrganization | null;
};

export type PresenceTarget = {
  organization: UserOrganization | null;
};

/**
 * Admin always. Otherwise same ANG organization and can_manage_presence.
 * Users without organization cannot be delegated (except by admin).
 */
export function canDelegatePresence(
  actor: PresenceActor,
  target: PresenceTarget
): boolean {
  if (actor.isAdmin) return true;
  if (!actor.canManagePresence) return false;
  if (!actor.organization || !target.organization) return false;
  return actor.organization === target.organization;
}
