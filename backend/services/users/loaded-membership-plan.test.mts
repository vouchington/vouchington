import { describe, expect, it } from 'vitest'
import { getLoadedMembershipPlan } from './loaded-membership-plan.mts'

describe('getLoadedMembershipPlan', () => {
  it.each([
    ['plus', 'plus'],
    ['pro', 'pro'],
    [null, null],
    [undefined, null],
  ] as const)('maps a loaded plan of %s to %s', (loaded, expected) => {
    expect(getLoadedMembershipPlan({ membership_plan: loaded })).toBe(expected)
  })
})
