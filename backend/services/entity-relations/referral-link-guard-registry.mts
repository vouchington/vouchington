import { createCodedError } from '@modules/on-error/create-coded-error'
import { ENTITY_RELATION_REFERRAL_LINK_GUARD_UNREGISTERED } from '@modules/on-error/error-codes'
import type { QueryOptions } from '@data-stores/psql/types'

export type ReferralLinkGuard = (
  urlIds: string[],
  userId?: string | null,
  options?: QueryOptions,
) => Promise<void>

let registeredGuard: ReferralLinkGuard | null = null

// @services/referral-program-link-validations registers its guard here as a side effect of
// module load (see
// backend/services/referral-program-link-validations/register-referral-link-guard.mts) so
// entity-relations never imports referral-program-link-validations directly.
export function registerReferralLinkGuard(guard: ReferralLinkGuard): void {
  registeredGuard = guard
}

export function unregisterReferralLinkGuardForTest(): void {
  registeredGuard = null
}

// Internal to entity-relations: only upsert.mts should call this. Throws instead of letting a
// related-url relation write silently skip the referral-link check when the registration above
// never ran (e.g. a missing side-effect import at process boot).
export function getRegisteredReferralLinkGuard(): ReferralLinkGuard {
  if (!registeredGuard) {
    throw createCodedError(
      500,
      'No referral-link guard registered for entity relations; @services/referral-program-link-validations must be imported for side effects before related-url relation writes occur',
      ENTITY_RELATION_REFERRAL_LINK_GUARD_UNREGISTERED,
    )
  }
  return registeredGuard
}
