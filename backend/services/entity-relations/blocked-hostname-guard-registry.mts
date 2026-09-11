import { createCodedError } from '@modules/on-error/create-coded-error'
import { ENTITY_RELATION_BLOCKED_HOSTNAME_GUARD_UNREGISTERED } from '@modules/on-error/error-codes'

export type BlockedHostnameGuard = (urlIds: string[], userId?: string | null) => Promise<void>

let registeredGuard: BlockedHostnameGuard | null = null

// @services/urls registers its guard here as a side effect of module load (see
// backend/services/urls/register-blocked-hostname-guard.mts) so entity-relations never imports
// urls directly.
export function registerBlockedHostnameGuard(guard: BlockedHostnameGuard): void {
  registeredGuard = guard
}

export function unregisterBlockedHostnameGuardForTest(): void {
  registeredGuard = null
}

// Internal to entity-relations: only upsert.mts should call this. Throws instead of letting a
// url relation write silently skip the blocked-hostname check when the registration above never
// ran (e.g. a missing side-effect import at process boot).
export function getRegisteredBlockedHostnameGuard(): BlockedHostnameGuard {
  if (!registeredGuard) {
    throw createCodedError(
      500,
      'No blocked-hostname guard registered for entity relations; @services/urls must be imported for side effects before url relation writes occur',
      ENTITY_RELATION_BLOCKED_HOSTNAME_GUARD_UNREGISTERED,
    )
  }
  return registeredGuard
}
