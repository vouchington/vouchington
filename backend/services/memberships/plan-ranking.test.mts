import { describe, expect, it } from 'vitest'
import type { MembershipPlanSlug } from './types.mts'
import { isHigherMembershipPlan } from './plan-ranking.mts'

describe('isHigherMembershipPlan', () => {
  it('fails closed for an invalid runtime plan', () => {
    const invalidPlan = 'enterprise' as unknown as MembershipPlanSlug

    expect(() => isHigherMembershipPlan(invalidPlan, 'plus')).toThrow(
      'Unhandled membership plan: enterprise',
    )
  })
})
