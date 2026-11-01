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

import * as articleIdCommentCommentIdPage from '../../../app/(posts)/article/[id]/comment/[commentId]/page'
import * as articleIdEditPage from '../../../app/(posts)/article/[id]/edit/page'
import * as articleIdPage from '../../../app/(posts)/article/[id]/page'
import * as articleIdTagsObjectTypePage from '../../../app/(posts)/article/[id]/tags/[objectType]/page'
import * as blogPostIdCommentCommentIdPage from '../../../app/(posts)/blog-post/[id]/comment/[commentId]/page'
import * as blogPostIdEditPage from '../../../app/(posts)/blog-post/[id]/edit/page'
import * as blogPostIdPage from '../../../app/(posts)/blog-post/[id]/page'
import * as blogPostIdTagsObjectTypePage from '../../../app/(posts)/blog-post/[id]/tags/[objectType]/page'
import * as dataPointIdCommentCommentIdPage from '../../../app/(posts)/data-point/[id]/comment/[commentId]/page'
import * as dataPointIdEditPage from '../../../app/(posts)/data-point/[id]/edit/page'
import * as dataPointIdPage from '../../../app/(posts)/data-point/[id]/page'
import * as dataPointIdTagsObjectTypePage from '../../../app/(posts)/data-point/[id]/tags/[objectType]/page'
import * as discussionIdCommentCommentIdPage from '../../../app/(posts)/discussion/[id]/comment/[commentId]/page'
import * as discussionIdEditPage from '../../../app/(posts)/discussion/[id]/edit/page'
import * as discussionIdPage from '../../../app/(posts)/discussion/[id]/page'
import * as discussionIdTagsObjectTypePage from '../../../app/(posts)/discussion/[id]/tags/[objectType]/page'
import * as linkIdCommentCommentIdPage from '../../../app/(posts)/link/[id]/comment/[commentId]/page'
import * as linkIdPage from '../../../app/(posts)/link/[id]/page'
import * as linkIdTagsObjectTypePage from '../../../app/(posts)/link/[id]/tags/[objectType]/page'
import * as reviewIdCommentCommentIdPage from '../../../app/(posts)/review/[id]/comment/[commentId]/page'
import * as reviewIdEditPage from '../../../app/(posts)/review/[id]/edit/page'
import * as reviewIdPage from '../../../app/(posts)/review/[id]/page'
import * as reviewIdTagsObjectTypePage from '../../../app/(posts)/review/[id]/tags/[objectType]/page'
import * as storyIdCommentCommentIdPage from '../../../app/(posts)/story/[id]/comment/[commentId]/page'
import * as storyIdPage from '../../../app/(posts)/story/[id]/page'
import * as storyIdTagsObjectTypePage from '../../../app/(posts)/story/[id]/tags/[objectType]/page'

const postRoutes = [
  articleIdCommentCommentIdPage,
  articleIdEditPage,
  articleIdPage,
  articleIdTagsObjectTypePage,
  blogPostIdCommentCommentIdPage,
  blogPostIdEditPage,
  blogPostIdPage,
  blogPostIdTagsObjectTypePage,
  dataPointIdCommentCommentIdPage,
  dataPointIdEditPage,
  dataPointIdPage,
  dataPointIdTagsObjectTypePage,
  discussionIdCommentCommentIdPage,
  discussionIdEditPage,
  discussionIdPage,
  discussionIdTagsObjectTypePage,
  linkIdCommentCommentIdPage,
  linkIdPage,
  linkIdTagsObjectTypePage,
  reviewIdCommentCommentIdPage,
  reviewIdEditPage,
  reviewIdPage,
  reviewIdTagsObjectTypePage,
  storyIdCommentCommentIdPage,
  storyIdPage,
  storyIdTagsObjectTypePage,
]

describe('post route modules load and export defaults', () => {
  it('exports a default component from each thin route module', () => {
    expect(postRoutes.length).toBeGreaterThan(0)
    for (const route of postRoutes) {
      assert(route.default !== undefined, 'thin route module must export default')
    }
  })
})
