import {
  classifyMembershipProjectionChange,
  type PriorMembership,
} from '../reconcile-source-projection.mts'
import { isTerminalMembershipStatus } from '../update-result.mts'
import type { MembershipChangeType, MembershipPlanSlug, MembershipStatus } from '../types.mts'

export function getCreatedMembershipChange(
  sourceKind: 'admin_grant' | 'direct',
  status: MembershipStatus,
  prior: PriorMembership | undefined,
  productId: string,
  plan: MembershipPlanSlug,
  preserveActiveGrantProjection: boolean,
): { changeType: MembershipChangeType; fromSkuId: string | null } {
  const terminal = isTerminalMembershipStatus(status)
  return {
    changeType:
      sourceKind === 'admin_grant'
        ? 'admin_grant'
        : terminal
          ? status === 'cancelled'
            ? 'cancellation'
            : 'expiration'
          : prior
            ? (classifyMembershipProjectionChange(prior, productId, plan, status) ?? 'renewal')
            : 'renewal',
    fromSkuId: preserveActiveGrantProjection
      ? terminal
        ? productId
        : null
      : (prior?.membership_product_id ?? null),
  }
}
