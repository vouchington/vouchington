import type { MembershipStatus } from './types.mts'
import { isTerminalMembershipStatus } from './update-result.mts'

export function getSourceAutoRenews(
  sourceKind: 'admin_grant' | 'direct',
  status: MembershipStatus,
  cancelAtPeriodEnd: boolean,
): boolean {
  return sourceKind === 'direct' && !isTerminalMembershipStatus(status) && !cancelAtPeriodEnd
}
