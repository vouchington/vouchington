import { describe, expect, it } from 'vitest'
import type { MembershipPlanSlug } from './types.mts'
import { compareMembershipPlans, isHigherMembershipPlan } from './plan-ranking.mts'

describe('compareMembershipPlans', () => {
  it('ranks pro above plus and treats equal plans as unchanged', () => {
    expect(compareMembershipPlans('pro', 'plus')).toBeGreaterThan(0)
    expect(compareMembershipPlans('plus', 'pro')).toBeLessThan(0)
    expect(compareMembershipPlans('plus', 'plus')).toBe(0)
  })
})

describe('isHigherMembershipPlan', () => {
  it('fails closed for an invalid runtime plan', () => {
    const invalidPlan = 'enterprise' as unknown as MembershipPlanSlug

    expect(() => isHigherMembershipPlan(invalidPlan, 'plus')).toThrow(
      'Unhandled membership plan: enterprise',
    )
  })
})
