import { render, screen } from '@testing-library/react'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'

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

// Eagerly import all thin route files from the explicit topic-type directories.
// This executes every module-level statement (factory calls, export const dynamic,
// createNoIndexMetadata()) and is the primary mechanism for hitting the patch lines
// that live outside of testable function bodies.

interface RouteModule {
  default: unknown
  generateMetadata?: unknown
}

const topicRoutes = import.meta.glob(
  '../../../app/*/{bank-account,card,instance,referral-program,rewards-program,rewards-program-status,source,topic}/**/{page,layout}.{ts,tsx}',
  { eager: true },
) as Record<string, RouteModule>

const postRoutes = import.meta.glob(
  '../../../app/*/{article,blog-post,data-point,discussion,link,review,story}/**/{page,layout}.{ts,tsx}',
  { eager: true },
) as Record<string, RouteModule>

// Static imports for tags page function-body coverage (lines inside the async page
// function that are only executed when the component is actually called/rendered).

import * as linksPage from '../../../app/(posts)/links/page'
import * as bankAccountTagsPage from '../../../app/(topics)/bank-account/[id]/tags/[objectType]/page'
import * as cardTagsPage from '../../../app/(topics)/card/[id]/tags/[objectType]/page'
import * as instanceTagsPage from '../../../app/(topics)/instance/[id]/tags/[objectType]/page'
import * as referralProgramTagsPage from '../../../app/(topics)/referral-program/[id]/tags/[objectType]/page'
import * as rewardsProgramTagsPage from '../../../app/(topics)/rewards-program/[id]/tags/[objectType]/page'
import * as rewardsProgramStatusTagsPage from '../../../app/(topics)/rewards-program-status/[id]/tags/[objectType]/page'
import * as sourceTagsPage from '../../../app/(topics)/source/[id]/tags/[objectType]/page'
import * as topicTagsPage from '../../../app/(topics)/topic/[id]/tags/[objectType]/page'

type TagsPageFn = (props: {
  params: Promise<{ id: string; objectType: string }>
}) => Promise<React.JSX.Element>

const allTagsPages: [string, { default: TagsPageFn }][] = [
  ['bank-account', bankAccountTagsPage as never],
  ['card', cardTagsPage as never],
  ['instance', instanceTagsPage as never],
  ['referral-program', referralProgramTagsPage as never],
  ['rewards-program', rewardsProgramTagsPage as never],
  ['rewards-program-status', rewardsProgramStatusTagsPage as never],
  ['source', sourceTagsPage as never],
  ['topic', topicTagsPage as never],
]

describe('thin route modules load and export defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('all topic route files export a default component', () => {
    expect(Object.keys(topicRoutes).length).toBeGreaterThan(0)
    for (const [path, module] of Object.entries(topicRoutes)) {
      assert(module.default !== undefined, `${path} must export default`)
    }
  })

  it('all post route files export a default component', () => {
    expect(Object.keys(postRoutes).length).toBeGreaterThan(0)
    for (const [path, module] of Object.entries(postRoutes)) {
      assert(module.default !== undefined, `${path} must export default`)
    }
  })
})

describe.each(allTagsPages)('%s topic tags page', (_slug, module) => {
  const TagsPage = module.default

  it('renders ManageTopicTags for valid objectType', async () => {
    const result = await TagsPage({
      params: Promise.resolve({ id: 'topic-1', objectType: 'topic' }),
    })
    render(result)
    expect(screen.getByTestId('manage-topic-tags')).toBeDefined()
  })

  it('calls notFound for invalid objectType', async () => {
    await expect(
      TagsPage({ params: Promise.resolve({ id: 'topic-1', objectType: 'invalid' }) }),
    ).rejects.toThrow('notFound')
  })
})

describe('links list page', () => {
  it('renders LinksPage', async () => {
    type LinksPageFn = (props: {
      searchParams: Promise<Record<string, string | string[] | undefined>>
    }) => Promise<React.JSX.Element>
    const LinksPage = linksPage.default as LinksPageFn
    const result = await LinksPage({ searchParams: Promise.resolve({}) })
    render(result)
    expect(screen.getByTestId('post-list-page')).toBeDefined()
  })
})
