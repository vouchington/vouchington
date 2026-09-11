/**
 * Compute the public display name for a verified user based on their preferences.
 * Returns null when no name should be shown.
 */

type NameDisplayUser = {
  verification_status: string
  verified_badge_visible: boolean
  public_verified_name_display: string
  verified_first_name: string | null
  verified_last_name_initial: string | null
  verified_full_name: string | null
}

export function computeVerifiedDisplayName(user: NameDisplayUser): string | null {
  if (user.verification_status !== 'verified') return null
  if (!user.verified_badge_visible) return null

  switch (user.public_verified_name_display) {
    case 'first_name':
      return user.verified_first_name ?? null
    case 'first_name_last_initial': {
      const first = user.verified_first_name
      const initial = user.verified_last_name_initial
      if (!first) return null
      return initial ? `${first} ${initial}.` : first
    }
    case 'full_name':
      return user.verified_full_name ?? null
    default:
      return null
  }
}
