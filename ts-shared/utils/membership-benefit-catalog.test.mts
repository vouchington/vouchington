import { describe, expect, it } from 'vitest'
import { membershipBenefitCatalog } from './membership-benefit-catalog.mts'

describe('membershipBenefitCatalog', () => {
  it('publishes catalog version 1', () => {
    expect(membershipBenefitCatalog.version).toBe(1)
  })
})
