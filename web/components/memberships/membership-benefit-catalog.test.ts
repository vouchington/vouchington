import { describe, expect, it } from 'vitest'

import plansFixture from '../../../api-fixtures/v1/responses/native.memberships.plans.default.json'
import { builtMembershipBenefitCatalog } from './membership-benefit-catalog'

describe('builtMembershipBenefitCatalog', () => {
  it('stays locked to the versioned public plans fixture', () => {
    expect(builtMembershipBenefitCatalog).toEqual(plansFixture.benefit_catalog)
  })
})
