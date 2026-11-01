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

import * as instanceIdDataPointsPage from '../../../app/(topics)/instance/[id]/data-points/page'
import * as instanceIdDiscussionsPage from '../../../app/(topics)/instance/[id]/discussions/page'
import * as instanceIdLatestPage from '../../../app/(topics)/instance/[id]/latest/page'
import * as instanceIdLayout from '../../../app/(topics)/instance/[id]/layout'
import * as instanceIdNewsPage from '../../../app/(topics)/instance/[id]/news/page'
import * as instanceIdPage from '../../../app/(topics)/instance/[id]/page'
import * as instanceIdPostsPage from '../../../app/(topics)/instance/[id]/posts/page'
import * as instanceIdReferralLinksPage from '../../../app/(topics)/instance/[id]/referral-links/page'
import * as instanceIdReviewsPage from '../../../app/(topics)/instance/[id]/reviews/page'
import * as instanceIdSettingsAboutPage from '../../../app/(topics)/instance/[id]/settings/about/page'
import * as instanceIdSettingsAliasesPage from '../../../app/(topics)/instance/[id]/settings/aliases/page'
import * as instanceIdSettingsBehaviorPage from '../../../app/(topics)/instance/[id]/settings/behavior/page'
import * as instanceIdSettingsDomainsPage from '../../../app/(topics)/instance/[id]/settings/domains/page'
import * as instanceIdSettingsMergePage from '../../../app/(topics)/instance/[id]/settings/merge/page'
import * as instanceIdSettingsPage from '../../../app/(topics)/instance/[id]/settings/page'
import * as instanceIdSettingsSourcePage from '../../../app/(topics)/instance/[id]/settings/source/page'
import * as sourceIdCrawlsCrawlIdPage from '../../../app/(topics)/source/[id]/crawls/[crawlId]/page'
import * as sourceIdCrawlsPage from '../../../app/(topics)/source/[id]/crawls/page'
import * as sourceIdDataPointsPage from '../../../app/(topics)/source/[id]/data-points/page'
import * as sourceIdDiscussionsPage from '../../../app/(topics)/source/[id]/discussions/page'
import * as sourceIdLatestPage from '../../../app/(topics)/source/[id]/latest/page'
import * as sourceIdLayout from '../../../app/(topics)/source/[id]/layout'
import * as sourceIdNewsPage from '../../../app/(topics)/source/[id]/news/page'
import * as sourceIdPage from '../../../app/(topics)/source/[id]/page'
import * as sourceIdPostsPage from '../../../app/(topics)/source/[id]/posts/page'
import * as sourceIdReferralLinksPage from '../../../app/(topics)/source/[id]/referral-links/page'
import * as sourceIdReviewsPage from '../../../app/(topics)/source/[id]/reviews/page'
import * as sourceIdSettingsAboutPage from '../../../app/(topics)/source/[id]/settings/about/page'
import * as sourceIdSettingsAliasesPage from '../../../app/(topics)/source/[id]/settings/aliases/page'
import * as sourceIdSettingsBehaviorPage from '../../../app/(topics)/source/[id]/settings/behavior/page'
import * as sourceIdSettingsDomainsPage from '../../../app/(topics)/source/[id]/settings/domains/page'
import * as sourceIdSettingsMergePage from '../../../app/(topics)/source/[id]/settings/merge/page'
import * as sourceIdSettingsPage from '../../../app/(topics)/source/[id]/settings/page'
import * as sourceIdSettingsSourcePage from '../../../app/(topics)/source/[id]/settings/source/page'

const topicRoutes = [
  instanceIdDataPointsPage,
  instanceIdDiscussionsPage,
  instanceIdLatestPage,
  instanceIdLayout,
  instanceIdNewsPage,
  instanceIdPage,
  instanceIdPostsPage,
  instanceIdReferralLinksPage,
  instanceIdReviewsPage,
  instanceIdSettingsAboutPage,
  instanceIdSettingsAliasesPage,
  instanceIdSettingsBehaviorPage,
  instanceIdSettingsDomainsPage,
  instanceIdSettingsMergePage,
  instanceIdSettingsPage,
  instanceIdSettingsSourcePage,
  sourceIdCrawlsCrawlIdPage,
  sourceIdCrawlsPage,
  sourceIdDataPointsPage,
  sourceIdDiscussionsPage,
  sourceIdLatestPage,
  sourceIdLayout,
  sourceIdNewsPage,
  sourceIdPage,
  sourceIdPostsPage,
  sourceIdReferralLinksPage,
  sourceIdReviewsPage,
  sourceIdSettingsAboutPage,
  sourceIdSettingsAliasesPage,
  sourceIdSettingsBehaviorPage,
  sourceIdSettingsDomainsPage,
  sourceIdSettingsMergePage,
  sourceIdSettingsPage,
  sourceIdSettingsSourcePage,
]

describe('topic instance and source route modules load and export defaults', () => {
  it('exports a default component from each thin route module', () => {
    expect(topicRoutes.length).toBeGreaterThan(0)
    for (const route of topicRoutes) {
      assert(route.default !== undefined, 'thin route module must export default')
    }
  })
})
