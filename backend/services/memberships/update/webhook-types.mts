import type { QueryExecutor } from '@data-stores/psql'
import type { MembershipPlanSlug, MembershipStatus } from '../types.mts'
import type { MembershipUpdateResult } from '../update-result.mts'

export type RecordMembershipUpdateChange = (
  membership: MembershipUpdateResult,
  query: QueryExecutor,
) => Promise<boolean | void>

export type MembershipWebhookUpdateOptions = {
  membershipId: string
  status?: MembershipStatus
  plan?: MembershipPlanSlug
  skuId?: string
  membershipSourceId?: string
  expiresAt?: Date | null
  effectiveAt?: Date | null
  terminalEffectiveAt?: Date | null
  transitionEffectiveAt?: Date | null
  cancelAtPeriodEnd?: boolean
  query?: QueryExecutor
}
