import type { PrivateUser } from '@services/users/types'

// "High trust" users skip the reCAPTCHA assessment entirely so we never spend a paid assessment on
// them. For now (per issue #4445) that is just administrators; there is no trust-tier system. Kept
// as a dedicated predicate so the definition of "high trust" can grow without touching assess.mts.
export function isHighTrustUser(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanViewRecaptchaConfig(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanUpdateRecaptchaConfig(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}
