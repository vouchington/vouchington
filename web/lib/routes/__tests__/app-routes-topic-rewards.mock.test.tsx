import '@/test-helpers/i18n/mock-json-messages'
import { assert, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/routes/topic-subpage-factories'), () => ({
  createTopicRootPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicPostsPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicReviewsPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicDataPointsPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
}))
vi.mock(import('@/lib/routes/topic-navigation-factories'), () => ({
  createTopicLatestPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicNewsPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicDiscussionsPage: vi.fn<VitestLooseMock>(() => ({
    default: vi.fn<VitestLooseMock>(() => null),
  })),
}))
vi.mock(import('@/lib/routes/topic-referral-factories'), () => ({
  createTopicReferralLinksPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
}))
vi.mock(import('@/lib/routes/topic-layout-factory'), () => ({
  createTopicLayout: vi.fn<VitestLooseMock>(() => vi.fn<VitestLooseMock>(() => null)),
}))
vi.mock(import('@/lib/routes/topic-settings-factories'), () => ({
  createTopicSettingsPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicSettingsAboutPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicSettingsBehaviorPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
}))
vi.mock(import('@/lib/routes/topic-management-factories'), () => ({
  createTopicSettingsDomainsPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicSettingsSourcePage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicSettingsAliasesPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicSettingsMergePage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicSettingsValidationsPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicSourceCrawlsPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createTopicSourceCrawlDetailPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
}))
vi.mock(import('@/lib/routes/post-route-factories'), () => ({
  createPostDetailPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
}))
vi.mock(import('@/lib/routes/post-edit-factories'), () => ({
  createPostEditPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createPostTagsPage: vi.fn<VitestLooseMock>(() => ({
    default: vi.fn<VitestLooseMock>(() => null),
  })),
}))
vi.mock(import('@/lib/routes/post-comment-factories'), () => ({
  createCommentPermalinkPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
}))
vi.mock(import('@/lib/routes/referral-validation-factories'), () => ({
  createReferralProgramValidationsListPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createReferralProgramValidationNewPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
  createReferralProgramValidationDetailPage: vi.fn<VitestLooseMock>(() => ({
    generateMetadata: vi.fn<VitestLooseMock>(() => ({})),
    default: vi.fn<VitestLooseMock>(() => null),
  })),
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
  createPageMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(
  import('@/components/posts/post-list-page'),
  () =>
    ({
      PostListPage: () => <div data-testid='post-list-page' />,
    }) as unknown as typeof import('@/components/posts/post-list-page'),
)
vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: vi.fn<VitestLooseMock>(() => {
        throw new Error('notFound')
      }),
      redirect: vi.fn<VitestLooseMock>(() => {
        throw new Error('redirect')
      }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/components/tags/manage-topic-tags'),
  () =>
    ({
      ManageTopicTags: () => <div data-testid='manage-topic-tags' />,
    }) as unknown as typeof import('@/components/tags/manage-topic-tags'),
)

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
