export { isTerminalMembershipStatus } from '@vouchington/memberships'
import type { MembershipPlanSlug, MembershipStatus } from './types.mts'

export type MembershipLifecycleFields = {
  user_id: string
  plan: MembershipPlanSlug
  sku_id: string
  status: MembershipStatus
  expires_at: Date | null
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
  cancel_at_period_end: boolean
}

export type MembershipUpdateResult = {
  previous: MembershipLifecycleFields
  current: MembershipLifecycleFields
}

export type MembershipUpdateRow = {
  previous_user_id: string
  previous_plan: MembershipPlanSlug
  previous_sku_id: string
  previous_status: MembershipStatus
  previous_expires_at: Date | null
  previous_cancelled_at: Date | null
  previous_expired_at: Date | null
  previous_past_due_at: Date | null
  previous_paused_at: Date | null
  previous_cancel_at_period_end: boolean
  current_user_id: string
  current_plan: MembershipPlanSlug
  current_sku_id: string
  current_status: MembershipStatus
  current_expires_at: Date | null
  current_cancelled_at: Date | null
  current_expired_at: Date | null
  current_past_due_at: Date | null
  current_paused_at: Date | null
  current_cancel_at_period_end: boolean
}

export function parseMembershipUpdateRow(
  row: MembershipUpdateRow | undefined,
): MembershipUpdateResult | null {
  if (!row) return null
  return {
    previous: {
      user_id: row.previous_user_id,
      plan: row.previous_plan,
      sku_id: row.previous_sku_id,
      status: row.previous_status,
      expires_at: row.previous_expires_at,
      cancelled_at: row.previous_cancelled_at,
      expired_at: row.previous_expired_at,
      past_due_at: row.previous_past_due_at,
      paused_at: row.previous_paused_at,
      cancel_at_period_end: row.previous_cancel_at_period_end,
    },
    current: {
      user_id: row.current_user_id,
      plan: row.current_plan,
      sku_id: row.current_sku_id,
      status: row.current_status,
      expires_at: row.current_expires_at,
      cancelled_at: row.current_cancelled_at,
      expired_at: row.current_expired_at,
      past_due_at: row.current_past_due_at,
      paused_at: row.current_paused_at,
      cancel_at_period_end: row.current_cancel_at_period_end,
    },
  }
}
