import sql from 'sql-template-strings'
import type { MembershipStatus } from './types.mts'

export type MembershipLifecycleClockOptions = {
  effectiveAt?: Date | null
  terminalEffectiveAt?: Date | null
  transitionEffectiveAt?: Date | null
}

export function appendLifecycleSetClauses(
  setClauses: ReturnType<typeof sql>[],
  status: MembershipStatus,
  options: MembershipLifecycleClockOptions = {},
) {
  const terminalEffectiveAt = options.terminalEffectiveAt ?? null
  if (status === 'active') {
    setClauses.push(sql`cancelled_at = NULL`)
    setClauses.push(sql`expired_at = NULL`)
    setClauses.push(sql`past_due_at = NULL`)
    setClauses.push(sql`paused_at = NULL`)
    return
  }
  if (status === 'cancelled') {
    setClauses.push(
      sql`cancelled_at = COALESCE(cancelled_at, ${terminalEffectiveAt}::timestamptz, CURRENT_TIMESTAMP)`,
    )
    setClauses.push(sql`expired_at = NULL`)
    setClauses.push(sql`past_due_at = NULL`)
    setClauses.push(sql`paused_at = NULL`)
    setClauses.push(sql`cancel_at_period_end = false`)
    return
  }
  if (status === 'expired') {
    setClauses.push(sql`cancelled_at = NULL`)
    setClauses.push(
      sql`expired_at = COALESCE(expired_at, ${terminalEffectiveAt}::timestamptz, CURRENT_TIMESTAMP)`,
    )
    setClauses.push(sql`past_due_at = NULL`)
    setClauses.push(sql`paused_at = NULL`)
    setClauses.push(sql`cancel_at_period_end = false`)
    return
  }
  if (status === 'past_due') {
    setClauses.push(sql`cancelled_at = NULL`)
    setClauses.push(sql`expired_at = NULL`)
    setClauses.push(
      sql`past_due_at = COALESCE(past_due_at, ${options.transitionEffectiveAt ?? null}::timestamptz, CURRENT_TIMESTAMP)`,
    )
    setClauses.push(sql`paused_at = NULL`)
    return
  }

  setClauses.push(sql`cancelled_at = NULL`)
  setClauses.push(sql`expired_at = NULL`)
  setClauses.push(sql`past_due_at = NULL`)
  setClauses.push(
    sql`paused_at = COALESCE(paused_at, ${options.transitionEffectiveAt ?? null}::timestamptz, CURRENT_TIMESTAMP)`,
  )
}
