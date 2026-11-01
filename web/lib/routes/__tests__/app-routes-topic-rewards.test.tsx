import '@/test-helpers/i18n/mock-json-messages'
import '@/test-helpers/lib/routes/thin-route-coverage.mock-support'
import { assert, describe, expect, it } from 'vitest'

// Static imports execute each thin route's module-level factory call.
// The static route coverage check owns the complete file inventory.

import * as rewardsProgramStatusIdDataPointsPage from '../../../app/(topics)/rewards-program-status/[id]/data-points/page'
import * as rewardsProgramStatusIdDiscussionsPage from '../../../app/(topics)/rewards-program-status/[id]/discussions/page'
import * as rewardsProgramStatusIdLatestPage from '../../../app/(topics)/rewards-program-status/[id]/latest/page'
import * as rewardsProgramStatusIdLayout from '../../../app/(topics)/rewards-program-status/[id]/layout'
import * as rewardsProgramStatusIdNewsPage from '../../../app/(topics)/rewards-program-status/[id]/news/page'
import * as rewardsProgramStatusIdPage from '../../../app/(topics)/rewards-program-status/[id]/page'
import * as rewardsProgramStatusIdPostsPage from '../../../app/(topics)/rewards-program-status/[id]/posts/page'
import * as rewardsProgramStatusIdReferralLinksPage from '../../../app/(topics)/rewards-program-status/[id]/referral-links/page'
import * as rewardsProgramStatusIdReviewsPage from '../../../app/(topics)/rewards-program-status/[id]/reviews/page'
import * as rewardsProgramStatusIdSettingsAboutPage from '../../../app/(topics)/rewards-program-status/[id]/settings/about/page'
import * as rewardsProgramStatusIdSettingsAliasesPage from '../../../app/(topics)/rewards-program-status/[id]/settings/aliases/page'
import * as rewardsProgramStatusIdSettingsBehaviorPage from '../../../app/(topics)/rewards-program-status/[id]/settings/behavior/page'
import * as rewardsProgramStatusIdSettingsDomainsPage from '../../../app/(topics)/rewards-program-status/[id]/settings/domains/page'
import * as rewardsProgramStatusIdSettingsMergePage from '../../../app/(topics)/rewards-program-status/[id]/settings/merge/page'
import * as rewardsProgramStatusIdSettingsPage from '../../../app/(topics)/rewards-program-status/[id]/settings/page'
import * as rewardsProgramStatusIdSettingsSourcePage from '../../../app/(topics)/rewards-program-status/[id]/settings/source/page'
import * as rewardsProgramIdDataPointsPage from '../../../app/(topics)/rewards-program/[id]/data-points/page'
import * as rewardsProgramIdDiscussionsPage from '../../../app/(topics)/rewards-program/[id]/discussions/page'
import * as rewardsProgramIdLatestPage from '../../../app/(topics)/rewards-program/[id]/latest/page'
import * as rewardsProgramIdLayout from '../../../app/(topics)/rewards-program/[id]/layout'
import * as rewardsProgramIdNewsPage from '../../../app/(topics)/rewards-program/[id]/news/page'
import * as rewardsProgramIdPage from '../../../app/(topics)/rewards-program/[id]/page'
import * as rewardsProgramIdPostsPage from '../../../app/(topics)/rewards-program/[id]/posts/page'
import * as rewardsProgramIdReferralLinksPage from '../../../app/(topics)/rewards-program/[id]/referral-links/page'
import * as rewardsProgramIdReviewsPage from '../../../app/(topics)/rewards-program/[id]/reviews/page'
import * as rewardsProgramIdSettingsAboutPage from '../../../app/(topics)/rewards-program/[id]/settings/about/page'
import * as rewardsProgramIdSettingsAliasesPage from '../../../app/(topics)/rewards-program/[id]/settings/aliases/page'
import * as rewardsProgramIdSettingsBehaviorPage from '../../../app/(topics)/rewards-program/[id]/settings/behavior/page'
import * as rewardsProgramIdSettingsDomainsPage from '../../../app/(topics)/rewards-program/[id]/settings/domains/page'
import * as rewardsProgramIdSettingsMergePage from '../../../app/(topics)/rewards-program/[id]/settings/merge/page'
import * as rewardsProgramIdSettingsPage from '../../../app/(topics)/rewards-program/[id]/settings/page'
import * as rewardsProgramIdSettingsSourcePage from '../../../app/(topics)/rewards-program/[id]/settings/source/page'
import * as topicIdDataPointsPage from '../../../app/(topics)/topic/[id]/data-points/page'
import * as topicIdDiscussionsPage from '../../../app/(topics)/topic/[id]/discussions/page'
import * as topicIdLatestPage from '../../../app/(topics)/topic/[id]/latest/page'
import * as topicIdLayout from '../../../app/(topics)/topic/[id]/layout'
import * as topicIdNewsPage from '../../../app/(topics)/topic/[id]/news/page'
import * as topicIdPage from '../../../app/(topics)/topic/[id]/page'
import * as topicIdPostsPage from '../../../app/(topics)/topic/[id]/posts/page'
import * as topicIdReferralLinksPage from '../../../app/(topics)/topic/[id]/referral-links/page'
import * as topicIdReviewsPage from '../../../app/(topics)/topic/[id]/reviews/page'
import * as topicIdSettingsAboutPage from '../../../app/(topics)/topic/[id]/settings/about/page'
import * as topicIdSettingsAliasesPage from '../../../app/(topics)/topic/[id]/settings/aliases/page'
import * as topicIdSettingsBehaviorPage from '../../../app/(topics)/topic/[id]/settings/behavior/page'
import * as topicIdSettingsDomainsPage from '../../../app/(topics)/topic/[id]/settings/domains/page'
import * as topicIdSettingsMergePage from '../../../app/(topics)/topic/[id]/settings/merge/page'
import * as topicIdSettingsPage from '../../../app/(topics)/topic/[id]/settings/page'
import * as topicIdSettingsSourcePage from '../../../app/(topics)/topic/[id]/settings/source/page'

const topicRoutes = [
  rewardsProgramStatusIdDataPointsPage,
  rewardsProgramStatusIdDiscussionsPage,
  rewardsProgramStatusIdLatestPage,
  rewardsProgramStatusIdLayout,
  rewardsProgramStatusIdNewsPage,
  rewardsProgramStatusIdPage,
  rewardsProgramStatusIdPostsPage,
  rewardsProgramStatusIdReferralLinksPage,
  rewardsProgramStatusIdReviewsPage,
  rewardsProgramStatusIdSettingsAboutPage,
  rewardsProgramStatusIdSettingsAliasesPage,
  rewardsProgramStatusIdSettingsBehaviorPage,
  rewardsProgramStatusIdSettingsDomainsPage,
  rewardsProgramStatusIdSettingsMergePage,
  rewardsProgramStatusIdSettingsPage,
  rewardsProgramStatusIdSettingsSourcePage,
  rewardsProgramIdDataPointsPage,
  rewardsProgramIdDiscussionsPage,
  rewardsProgramIdLatestPage,
  rewardsProgramIdLayout,
  rewardsProgramIdNewsPage,
  rewardsProgramIdPage,
  rewardsProgramIdPostsPage,
  rewardsProgramIdReferralLinksPage,
  rewardsProgramIdReviewsPage,
  rewardsProgramIdSettingsAboutPage,
  rewardsProgramIdSettingsAliasesPage,
  rewardsProgramIdSettingsBehaviorPage,
  rewardsProgramIdSettingsDomainsPage,
  rewardsProgramIdSettingsMergePage,
  rewardsProgramIdSettingsPage,
  rewardsProgramIdSettingsSourcePage,
  topicIdDataPointsPage,
  topicIdDiscussionsPage,
  topicIdLatestPage,
  topicIdLayout,
  topicIdNewsPage,
  topicIdPage,
  topicIdPostsPage,
  topicIdReferralLinksPage,
  topicIdReviewsPage,
  topicIdSettingsAboutPage,
  topicIdSettingsAliasesPage,
  topicIdSettingsBehaviorPage,
  topicIdSettingsDomainsPage,
  topicIdSettingsMergePage,
  topicIdSettingsPage,
  topicIdSettingsSourcePage,
]

describe('rewards and topic route modules load and export defaults', () => {
  it('exports a default component from each thin route module', () => {
    expect(topicRoutes.length).toBeGreaterThan(0)
    for (const route of topicRoutes) {
      assert(route.default !== undefined, 'thin route module must export default')
    }
  })
})
