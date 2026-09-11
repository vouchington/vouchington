import { describe, expect, it } from 'vitest'

import plansFixture from '../../../api-fixtures/v1/responses/native.memberships.plans.default.json'
import { fallbackMembershipBenefitCatalog } from './fallback-benefit-catalog'

describe('fallbackMembershipBenefitCatalog', () => {
  it('stays locked to the versioned public plans fixture', () => {
    expect(fallbackMembershipBenefitCatalog).toEqual(plansFixture.benefit_catalog)
  })
})
