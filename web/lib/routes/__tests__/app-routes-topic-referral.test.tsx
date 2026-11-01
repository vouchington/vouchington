import '@/test-helpers/i18n/mock-json-messages'
import '@/test-helpers/lib/routes/thin-route-coverage.mock-support'
import { assert, describe, expect, it } from 'vitest'

// Static imports execute each thin route's module-level factory call.
// The static route coverage check owns the complete file inventory.

import * as referralProgramIdDataPointsPage from '../../../app/(topics)/referral-program/[id]/data-points/page'
import * as referralProgramIdDiscussionsPage from '../../../app/(topics)/referral-program/[id]/discussions/page'
import * as referralProgramIdLatestPage from '../../../app/(topics)/referral-program/[id]/latest/page'
import * as referralProgramIdLayout from '../../../app/(topics)/referral-program/[id]/layout'
import * as referralProgramIdNewsPage from '../../../app/(topics)/referral-program/[id]/news/page'
import * as referralProgramIdPage from '../../../app/(topics)/referral-program/[id]/page'
import * as referralProgramIdPostsPage from '../../../app/(topics)/referral-program/[id]/posts/page'
import * as referralProgramIdReferralLinksPage from '../../../app/(topics)/referral-program/[id]/referral-links/page'
import * as referralProgramIdReviewsPage from '../../../app/(topics)/referral-program/[id]/reviews/page'
import * as referralProgramIdSettingsAboutPage from '../../../app/(topics)/referral-program/[id]/settings/about/page'
import * as referralProgramIdSettingsAliasesPage from '../../../app/(topics)/referral-program/[id]/settings/aliases/page'
import * as referralProgramIdSettingsBehaviorPage from '../../../app/(topics)/referral-program/[id]/settings/behavior/page'
import * as referralProgramIdSettingsDomainsPage from '../../../app/(topics)/referral-program/[id]/settings/domains/page'
import * as referralProgramIdSettingsMergePage from '../../../app/(topics)/referral-program/[id]/settings/merge/page'
import * as referralProgramIdSettingsPage from '../../../app/(topics)/referral-program/[id]/settings/page'
import * as referralProgramIdSettingsSourcePage from '../../../app/(topics)/referral-program/[id]/settings/source/page'
import * as referralProgramIdSettingsValidationsPage from '../../../app/(topics)/referral-program/[id]/settings/validations/page'
import * as referralProgramIdValidationsValidationIdPage from '../../../app/(topics)/referral-program/[id]/validations/[validationId]/page'
import * as referralProgramIdValidationsNewPage from '../../../app/(topics)/referral-program/[id]/validations/new/page'
import * as referralProgramIdValidationsPage from '../../../app/(topics)/referral-program/[id]/validations/page'

const topicRoutes = [
  referralProgramIdDataPointsPage,
  referralProgramIdDiscussionsPage,
  referralProgramIdLatestPage,
  referralProgramIdLayout,
  referralProgramIdNewsPage,
  referralProgramIdPage,
  referralProgramIdPostsPage,
  referralProgramIdReferralLinksPage,
  referralProgramIdReviewsPage,
  referralProgramIdSettingsAboutPage,
  referralProgramIdSettingsAliasesPage,
  referralProgramIdSettingsBehaviorPage,
  referralProgramIdSettingsDomainsPage,
  referralProgramIdSettingsMergePage,
  referralProgramIdSettingsPage,
  referralProgramIdSettingsSourcePage,
  referralProgramIdSettingsValidationsPage,
  referralProgramIdValidationsValidationIdPage,
  referralProgramIdValidationsNewPage,
  referralProgramIdValidationsPage,
]

describe('referral program route modules load and export defaults', () => {
  it('exports a default component from each thin route module', () => {
    expect(topicRoutes.length).toBeGreaterThan(0)
    for (const route of topicRoutes) {
      assert(route.default !== undefined, 'thin route module must export default')
    }
  })
})
