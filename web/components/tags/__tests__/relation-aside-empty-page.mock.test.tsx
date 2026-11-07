import { Suspense, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'
import type { Post } from '@/types/posts'
import type { Topic } from '@/types/topics'
import { PostRelatedPostsAside } from '../post-related-posts-aside'
import { PostRelatedPostsAsideStreaming } from '../post-related-posts-aside-streaming'
import { PostRelatedTopicsAside } from '../post-related-topics-aside'
import { PostRelatedTopicsAsideStreaming } from '../post-related-topics-aside-streaming'
import { TopicFaqPostsAside } from '../topic-faq-posts-aside'
import { TopicFaqPostsAsideStreaming } from '../topic-faq-posts-aside-streaming'
import { TopicRelatedTopicsAside } from '../topic-related-topics-aside'
import { TopicRelatedTopicsAsideStreaming } from '../topic-related-topics-aside-streaming'

const { mockGetEntityRelations, receiveResponse } = vi.hoisted(() => ({
  mockGetEntityRelations: vi.fn<VitestLooseMock>(),
  receiveResponse: vi.fn<VitestLooseMock>(),
}))

function AsideProbe({ response }: { response?: EntityRelationsResponse }) {
  receiveResponse(response ?? null)
  return <div data-testid='relation-aside' />
}

vi.mock(import('@/lib/api/server'), () => ({
  getEntityRelations: mockGetEntityRelations,
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(
  import('../topic-faq-posts-aside-content'),
  () =>
    ({
      TopicFaqPostsAsideContent: AsideProbe,
    }) as unknown as typeof import('../topic-faq-posts-aside-content'),
)
vi.mock(
  import('../topic-related-topics-aside-content'),
  () =>
    ({
      TopicRelatedTopicsAsideContent: AsideProbe,
    }) as unknown as typeof import('../topic-related-topics-aside-content'),
)
vi.mock(
  import('../post-related-posts-aside-content'),
  () =>
    ({
      PostRelatedPostsAsideContent: AsideProbe,
    }) as unknown as typeof import('../post-related-posts-aside-content'),
)
vi.mock(
  import('../post-related-topics-aside-content'),
  () =>
    ({
      PostRelatedTopicsAsideContent: AsideProbe,
    }) as unknown as typeof import('../post-related-topics-aside-content'),
)

const topic = { id: 'topic-1', slug: 'test-topic' } as unknown as Topic
const post = { id: 'post-1', slug: 'test-post' } as unknown as Post

function relationResponse({
  continues = false,
  withRelation = false,
}: {
  continues?: boolean
  withRelation?: boolean
} = {}): EntityRelationsResponse {
  return {
    results: withRelation ? [{ __entity_type: 'entity_relation', id: 'rel-1' }] : [],
    page_info: {
      has_next_page: continues,
      end_cursor: continues ? 'cursor-1' : null,
      start_cursor: null,
    },
    entity_relations: withRelation
      ? {
          'rel-1': {
            id: 'rel-1',
            object_id: 'object-1',
            created_at: '2026-01-01T00:00:00.000Z',
            created_by_id: 'user-1',
            object_data: { id: 'object-1' },
          },
        }
      : {},
  }
}

const streamingCases = [
  {
    name: 'topic FAQ posts',
    render: (responsePromise: Promise<EntityRelationsResponse>) => (
      <TopicFaqPostsAsideStreaming
        topic={topic}
        responsePromise={responsePromise}
      />
    ),
  },
  {
    name: 'topic related topics',
    render: (responsePromise: Promise<EntityRelationsResponse>) => (
      <TopicRelatedTopicsAsideStreaming
        topic={topic}
        responsePromise={responsePromise}
      />
    ),
  },
  {
    name: 'post related posts',
    render: (responsePromise: Promise<EntityRelationsResponse>) => (
      <PostRelatedPostsAsideStreaming
        post={post}
        responsePromise={responsePromise}
      />
    ),
  },
  {
    name: 'post related topics',
    render: (responsePromise: Promise<EntityRelationsResponse>) => (
      <PostRelatedTopicsAsideStreaming
        post={post}
        responsePromise={responsePromise}
      />
    ),
  },
]

const loggedOutCases = [
  { name: 'topic FAQ posts', load: () => TopicFaqPostsAside({ topic }) },
  { name: 'topic related topics', load: () => TopicRelatedTopicsAside({ topic }) },
  { name: 'post related posts', load: () => PostRelatedPostsAside({ post }) },
  { name: 'post related topics', load: () => PostRelatedTopicsAside({ post }) },
]

async function renderStreaming(node: ReactNode, responsePromise: Promise<EntityRelationsResponse>) {
  await act(async () => {
    render(<Suspense fallback={null}>{node}</Suspense>)
    await responsePromise
  })
}

describe('relation aside empty membership pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe.each(streamingCases)('$name streaming', ({ render: renderAside }) => {
    it('mounts the paginated aside when the visible page is empty and another window exists', async () => {
      const response = relationResponse({ continues: true })
      const responsePromise = Promise.resolve(response)

      await renderStreaming(renderAside(responsePromise), responsePromise)

      expect(screen.getByTestId('relation-aside')).toBeInTheDocument()
      expect(receiveResponse).toHaveBeenCalledWith(response)
    })

    it('omits the aside when the visible page is empty and pagination is finished', async () => {
      const responsePromise = Promise.resolve(relationResponse())

      await renderStreaming(renderAside(responsePromise), responsePromise)

      expect(screen.queryByTestId('relation-aside')).not.toBeInTheDocument()
      expect(receiveResponse).not.toHaveBeenCalled()
    })

    it('omits the aside when the next page has no end cursor', async () => {
      const response = relationResponse()
      response.page_info = { has_next_page: true, end_cursor: null, start_cursor: null }
      const responsePromise = Promise.resolve(response)

      await renderStreaming(renderAside(responsePromise), responsePromise)

      expect(screen.queryByTestId('relation-aside')).not.toBeInTheDocument()
    })
  })

  it('still mounts a streaming aside that already has a visible relation', async () => {
    const responsePromise = Promise.resolve(relationResponse({ withRelation: true }))

    await renderStreaming(
      <TopicFaqPostsAsideStreaming
        topic={topic}
        responsePromise={responsePromise}
      />,
      responsePromise,
    )

    expect(screen.getByTestId('relation-aside')).toBeInTheDocument()
  })

  describe.each(loggedOutCases)('$name logged out', ({ load }) => {
    it('mounts the paginated aside when the visible page is empty and another window exists', async () => {
      const response = relationResponse({ continues: true })
      mockGetEntityRelations.mockResolvedValue(response)

      render(await load())

      expect(screen.getByTestId('relation-aside')).toBeInTheDocument()
      expect(receiveResponse).toHaveBeenCalledWith(response)
    })

    it('omits the aside when the visible page is empty and pagination is finished', async () => {
      mockGetEntityRelations.mockResolvedValue(relationResponse())

      expect(await load()).toBeNull()
      expect(receiveResponse).not.toHaveBeenCalled()
    })
  })
})
