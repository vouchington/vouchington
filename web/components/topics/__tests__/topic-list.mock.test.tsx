import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { TopicList } from '../topic-list'
import type { TopicsResponseBody } from '@/types/api-responses'
import { getPaginatedPage } from '@/lib/api/client'
import type { ElectionVote } from '@/types/posts'
// ElectionVote has __entity_type, user_id, score, created_at

// Capture electionVoteChoice passed down to each TopicCard
const capturedCardProps: Record<string, unknown>[] = []
vi.mock(
  import('../topic-card'),
  () =>
    ({
      TopicCard: (props: Record<string, unknown>) => {
        capturedCardProps.push(props)
        const topic = props.topic as { id: string; name: string } | undefined
        return <div data-testid={`topic-card-${topic?.id}`}>{topic?.name}</div>
      },
    }) as unknown as typeof import('../topic-card'),
)

// Records every onLoadMore callback passed to InfiniteScroll.
// Use mockReceiveLoadMore.mock.calls.at(-1)![0] after rendering to get the current callback.
const mockReceiveLoadMore = vi.fn<VitestLooseMock>()

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    onLoadMore,
  }: {
    children: React.ReactNode
    hasNextPage: boolean
    endCursor: string | null
    onLoadMore: () => Promise<void | boolean>
    resetKey?: unknown
  }) => {
    mockReceiveLoadMore(onLoadMore)
    return <div>{children}</div>
  },
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/follow-button'), () => ({
  FollowButton: () => <div data-testid='follow-button' />,
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <div data-testid='entity-bookmark-button' />,
}))

const makeTopic = (id: string, name: string) => ({
  __entity_type: 'topic' as const,
  id,
  name,
  slug: name.toLowerCase().replace(/ /g, '-'),
  markdown: `${name} description`,
  aliases: [],
  topic_type: 'card' as const,
  noindex: false,
  allow_reviews: true,
  created_at: '2024-01-15T10:00:00Z',
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: { id: 'user-1', display_name: 'John Doe', display_name_url_id: 'john-doe' },
  updated_by: { id: 'user-1', display_name: 'John Doe', display_name_url_id: 'john-doe' },
})

const makePage = (
  topicId: string,
  name: string,
  hasNextPage: boolean,
  endCursor: string | null,
): TopicsResponseBody => ({
  results: [
    {
      __entity_type: 'topic',
      id: topicId,
      ranking: 1,
      name,
      slug: name.toLowerCase().replace(/ /g, '-'),
      topic_type: 'card',
    },
  ],
  topics: { [topicId]: makeTopic(topicId, name) },
  topics_metrics: {},
  topic_elections: {},
  page_info: { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: null },
})

describe('TopicList', () => {
  const mockData: TopicsResponseBody = {
    results: [
      {
        __entity_type: 'topic',
        id: 'topic-1',
        ranking: 1,
        name: 'Chase Sapphire Reserve',
        slug: 'chase-sapphire-reserve',
        topic_type: 'card',
      },
      {
        __entity_type: 'topic',
        id: 'topic-2',
        ranking: 2,
        name: 'World of Hyatt',
        slug: 'world-of-hyatt',
        topic_type: 'card',
      },
    ],
    topics: {
      'topic-1': makeTopic('topic-1', 'Chase Sapphire Reserve'),
      'topic-2': makeTopic('topic-2', 'World of Hyatt'),
    },
    topics_metrics: {},
    topic_elections: {},
    page_info: {
      has_next_page: false,
      end_cursor: null,
      start_cursor: null,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    capturedCardProps.length = 0
  })

  it('renders all topics in results', () => {
    render(<TopicList data={mockData} />)
    expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined()
    expect(screen.getByText('World of Hyatt')).toBeDefined()
  })

  it('renders empty state when no results', () => {
    const emptyData: TopicsResponseBody = {
      ...mockData,
      results: [],
      topics: {},
    }

    render(<TopicList data={emptyData} />)
    expect(screen.getByText('No topics found')).toBeDefined()
  })

  it('handles missing topics gracefully', () => {
    const dataWithMissingTopic: TopicsResponseBody = {
      ...mockData,
      results: [
        {
          __entity_type: 'topic',
          id: 'topic-1',
          ranking: 1,
          name: 'Chase Sapphire Reserve',
          slug: 'chase-sapphire-reserve',
          topic_type: 'card',
        },
        {
          __entity_type: 'topic',
          id: 'missing-topic',
          ranking: 2,
          name: 'Missing Topic',
          slug: 'missing-topic',
          topic_type: 'card',
        },
      ],
    }

    render(<TopicList data={dataWithMissingTopic} />)
    expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined()
    expect(screen.queryByText('Missing Topic')).toBeNull()
  })

  it('forwards election vote choice to TopicCard', () => {
    const vote: ElectionVote = {
      __entity_type: 'election_vote',
      entity_id: 'topic-1',
      user_id: 'user-1',
      choice: 'vouch',
      created_at: '2024-01-15T10:00:00Z',
    }
    const dataWithVotes: TopicsResponseBody = {
      ...mockData,
      election_votes: { 'topic-1': vote },
    }

    render(<TopicList data={dataWithVotes} />)

    const topic1Props = capturedCardProps.find(p => (p.topic as { id: string }).id === 'topic-1')
    expect(topic1Props?.electionVoteChoice).toBe('vouch')

    const topic2Props = capturedCardProps.find(p => (p.topic as { id: string }).id === 'topic-2')
    expect(topic2Props?.electionVoteChoice).toBeUndefined()
  })

  it('accumulates topics from the next page when loadMore is triggered', async () => {
    const page1 = makePage('topic-1', 'Chase Sapphire Reserve', true, 'cursor1')
    const page2 = makePage('topic-2', 'World of Hyatt', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page2)

    render(
      <TopicList
        data={page1}
        nextPageEndpoint='/api/v1/topics'
        nextPageParams={{ limit: 25 }}
      />,
    )

    expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined()
    expect(screen.queryByText('World of Hyatt')).toBeNull()

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined()
    expect(screen.getByText('World of Hyatt')).toBeDefined()
  })

  it('resets accumulated pages when initialData changes (filter/sort update)', async () => {
    const page1 = makePage('topic-1', 'Chase Sapphire Reserve', true, 'cursor1')
    const page2 = makePage('topic-2', 'World of Hyatt', false, null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page2)

    const { rerender } = render(
      <TopicList
        data={page1}
        nextPageEndpoint='/api/v1/topics'
        nextPageParams={{ limit: 25 }}
      />,
    )

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })
    expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined()
    expect(screen.getByText('World of Hyatt')).toBeDefined()

    const newData = makePage('topic-3', 'Delta SkyMiles', false, null)
    rerender(
      <TopicList
        data={newData}
        nextPageEndpoint='/api/v1/topics'
        nextPageParams={{ limit: 25 }}
      />,
    )

    expect(screen.queryByText('Chase Sapphire Reserve')).toBeNull()
    expect(screen.queryByText('World of Hyatt')).toBeNull()
    expect(screen.getByText('Delta SkyMiles')).toBeDefined()
  })
})
