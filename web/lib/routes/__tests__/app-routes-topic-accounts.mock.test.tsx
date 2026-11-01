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

import * as bankAccountIdDataPointsPage from '../../../app/(topics)/bank-account/[id]/data-points/page'
import * as bankAccountIdDiscussionsPage from '../../../app/(topics)/bank-account/[id]/discussions/page'
import * as bankAccountIdLatestPage from '../../../app/(topics)/bank-account/[id]/latest/page'
import * as bankAccountIdLayout from '../../../app/(topics)/bank-account/[id]/layout'
import * as bankAccountIdNewsPage from '../../../app/(topics)/bank-account/[id]/news/page'
import * as bankAccountIdPage from '../../../app/(topics)/bank-account/[id]/page'
import * as bankAccountIdPostsPage from '../../../app/(topics)/bank-account/[id]/posts/page'
import * as bankAccountIdReferralLinksPage from '../../../app/(topics)/bank-account/[id]/referral-links/page'
import * as bankAccountIdReviewsPage from '../../../app/(topics)/bank-account/[id]/reviews/page'
import * as bankAccountIdSettingsAboutPage from '../../../app/(topics)/bank-account/[id]/settings/about/page'
import * as bankAccountIdSettingsAliasesPage from '../../../app/(topics)/bank-account/[id]/settings/aliases/page'
import * as bankAccountIdSettingsBehaviorPage from '../../../app/(topics)/bank-account/[id]/settings/behavior/page'
import * as bankAccountIdSettingsDomainsPage from '../../../app/(topics)/bank-account/[id]/settings/domains/page'
import * as bankAccountIdSettingsMergePage from '../../../app/(topics)/bank-account/[id]/settings/merge/page'
import * as bankAccountIdSettingsPage from '../../../app/(topics)/bank-account/[id]/settings/page'
import * as bankAccountIdSettingsSourcePage from '../../../app/(topics)/bank-account/[id]/settings/source/page'
import * as cardIdDataPointsPage from '../../../app/(topics)/card/[id]/data-points/page'
import * as cardIdDiscussionsPage from '../../../app/(topics)/card/[id]/discussions/page'
import * as cardIdLatestPage from '../../../app/(topics)/card/[id]/latest/page'
import * as cardIdLayout from '../../../app/(topics)/card/[id]/layout'
import * as cardIdNewsPage from '../../../app/(topics)/card/[id]/news/page'
import * as cardIdPage from '../../../app/(topics)/card/[id]/page'
import * as cardIdPostsPage from '../../../app/(topics)/card/[id]/posts/page'
import * as cardIdReferralLinksPage from '../../../app/(topics)/card/[id]/referral-links/page'
import * as cardIdReviewsPage from '../../../app/(topics)/card/[id]/reviews/page'
import * as cardIdSettingsAboutPage from '../../../app/(topics)/card/[id]/settings/about/page'
import * as cardIdSettingsAliasesPage from '../../../app/(topics)/card/[id]/settings/aliases/page'
import * as cardIdSettingsBehaviorPage from '../../../app/(topics)/card/[id]/settings/behavior/page'
import * as cardIdSettingsDomainsPage from '../../../app/(topics)/card/[id]/settings/domains/page'
import * as cardIdSettingsMergePage from '../../../app/(topics)/card/[id]/settings/merge/page'
import * as cardIdSettingsPage from '../../../app/(topics)/card/[id]/settings/page'
import * as cardIdSettingsSourcePage from '../../../app/(topics)/card/[id]/settings/source/page'

const topicRoutes = [
  bankAccountIdDataPointsPage,
  bankAccountIdDiscussionsPage,
  bankAccountIdLatestPage,
  bankAccountIdLayout,
  bankAccountIdNewsPage,
  bankAccountIdPage,
  bankAccountIdPostsPage,
  bankAccountIdReferralLinksPage,
  bankAccountIdReviewsPage,
  bankAccountIdSettingsAboutPage,
  bankAccountIdSettingsAliasesPage,
  bankAccountIdSettingsBehaviorPage,
  bankAccountIdSettingsDomainsPage,
  bankAccountIdSettingsMergePage,
  bankAccountIdSettingsPage,
  bankAccountIdSettingsSourcePage,
  cardIdDataPointsPage,
  cardIdDiscussionsPage,
  cardIdLatestPage,
  cardIdLayout,
  cardIdNewsPage,
  cardIdPage,
  cardIdPostsPage,
  cardIdReferralLinksPage,
  cardIdReviewsPage,
  cardIdSettingsAboutPage,
  cardIdSettingsAliasesPage,
  cardIdSettingsBehaviorPage,
  cardIdSettingsDomainsPage,
  cardIdSettingsMergePage,
  cardIdSettingsPage,
  cardIdSettingsSourcePage,
]

describe('topic account route modules load and export defaults', () => {
  it('exports a default component from each thin route module', () => {
    expect(topicRoutes.length).toBeGreaterThan(0)
    for (const route of topicRoutes) {
      assert(route.default !== undefined, 'thin route module must export default')
    }
  })
})
