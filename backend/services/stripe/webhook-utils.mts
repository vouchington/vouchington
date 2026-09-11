import type { MembershipStatus } from '@services/memberships/types'

export function mapStripeWebhookStatus(stripeStatus: string): MembershipStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'paused':
      return 'paused'
    case 'canceled':
    case 'unpaid':
      return 'cancelled'
    case 'incomplete':
    case 'incomplete_expired':
      return 'expired'
    default:
      throw new Error(`Unknown Stripe subscription status: ${stripeStatus}`)
  }
}

export function getStripeObjectString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function getStripeObjectId(value: unknown): string | null {
  const id = getStripeObjectString(value)
  if (id) return id
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return getStripeObjectString((value as Record<string, unknown>).id)
}

export function getStripeObjectNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

export function getStripeObjectBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}
