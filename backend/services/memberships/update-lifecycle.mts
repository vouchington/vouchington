import sql from 'sql-template-strings'
import type { MembershipStatus } from './types.mts'

export type MembershipLifecycleClockOptions = {
  effectiveAt?: Date | null
  terminalEffectiveAt?: Date | null
  transitionEffectiveAt?: Date | null
}

export function getLifecycleSetClauses(
  status: MembershipStatus,
  options: MembershipLifecycleClockOptions = {},
): ReturnType<typeof sql>[] {
  const terminalEffectiveAt = options.terminalEffectiveAt ?? null
  if (status === 'active') {
    return [
      sql`cancelled_at = NULL`,
      sql`expired_at = NULL`,
      sql`past_due_at = NULL`,
      sql`paused_at = NULL`,
    ]
  }
  if (status === 'cancelled') {
    return [
      sql`cancelled_at = COALESCE(cancelled_at, ${terminalEffectiveAt}::timestamptz, CURRENT_TIMESTAMP)`,
      sql`expired_at = NULL`,
      sql`past_due_at = NULL`,
      sql`paused_at = NULL`,
      sql`should_cancel_at_period_end = false`,
    ]
  }
  if (status === 'expired') {
    return [
      sql`cancelled_at = NULL`,
      sql`expired_at = COALESCE(expired_at, ${terminalEffectiveAt}::timestamptz, CURRENT_TIMESTAMP)`,
      sql`past_due_at = NULL`,
      sql`paused_at = NULL`,
      sql`should_cancel_at_period_end = false`,
    ]
  }
  if (status === 'past_due') {
    return [
      sql`cancelled_at = NULL`,
      sql`expired_at = NULL`,
      sql`past_due_at = COALESCE(past_due_at, ${options.transitionEffectiveAt ?? null}::timestamptz, CURRENT_TIMESTAMP)`,
      sql`paused_at = NULL`,
    ]
  }

  return [
    sql`cancelled_at = NULL`,
    sql`expired_at = NULL`,
    sql`past_due_at = NULL`,
    sql`paused_at = COALESCE(paused_at, ${options.transitionEffectiveAt ?? null}::timestamptz, CURRENT_TIMESTAMP)`,
  ]
}
