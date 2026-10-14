import type { PrivateUser } from '@voucha/types/entities/user'

export function currentUserCanFilterHostnameModeration(
  currentUser: Pick<PrivateUser, 'roles'> | null | undefined,
): boolean {
  if (!currentUser) return false
  return Array.isArray(currentUser.roles) && currentUser.roles.includes('administrator')
}

/** Private email identities and blocked hostnames stay invisible outside moderation. */
export function currentUserCanViewHostname(
  currentUser: Pick<PrivateUser, 'roles'> | null | undefined,
  hostname: unknown,
): boolean {
  if (currentUserCanFilterHostnameModeration(currentUser)) return true
  if (typeof hostname !== 'object' || hostname === null) return false
  const entity = hostname as { is_blocked?: unknown; publicly_introduced_at?: unknown }
  return entity.is_blocked !== true && !!entity.publicly_introduced_at
}
