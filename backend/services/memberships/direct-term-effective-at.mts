import type { CreateMembershipOptions } from './create-types.mts'
import { isTerminalMembershipStatus } from './update-result.mts'
import type { MembershipStatus } from './types.mts'

export function getDirectTermEffectiveAt(
  options: CreateMembershipOptions,
  status: MembershipStatus,
  requestedEffectiveAt: Date,
): Date | undefined {
  if (!options.stripeSubscriptionId || isTerminalMembershipStatus(status) || status === 'paused')
    return undefined
  const expiresAt = options.expiresAt
  return expiresAt && expiresAt < requestedEffectiveAt ? expiresAt : requestedEffectiveAt
}
