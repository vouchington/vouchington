import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicList } from '../topic-list'
import type { FediverseInstancesResponse } from '@/types/fediverse-instances'
import type { Topic } from '@/types/topics'
import type { TopicCardProps } from '../topic-card'

const capturedCardProps: Record<string, unknown>[] = []
const receiveLoadMore = vi.fn<VitestLooseMock>()
const mockGetPaginatedPage = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('../topic-card'),
  () =>
    ({
      TopicCard: (props: TopicCardProps) => {
        capturedCardProps.push(props as unknown as Record<string, unknown>)
        return <div />
      },
    }) as unknown as typeof import('../topic-card'),
)
vi.mock(
  import('@/components/shared/infinite-scroll'),
  () =>
    ({
      InfiniteScroll: ({
        children,
        onLoadMore,
      }: {
        children: React.ReactNode
        onLoadMore: () => Promise<void>
      }) => {
        receiveLoadMore(onLoadMore)
        return <div>{children}</div>
      },
    }) as unknown as typeof import('@/components/shared/infinite-scroll'),
)
vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: mockGetPaginatedPage,
}))
vi.mock(import('@/lib/api/client/paginated'), () => ({
  getPaginatedPage: mockGetPaginatedPage,
}))

function makeTopic(id: string, hostnameId: string): Topic {
  return {
    __entity_type: 'topic',
    id,
    name: `${id}.example`,
    slug: id,
    markdown: '',
    aliases: [],
    topic_type: 'fediverse_instance',
    noindex: false,
    allow_reviews: false,
    created_at: '2026-01-01T00:00:00Z',
    created_by: { id: 'user-1', display_name: 'Test', display_name_url_id: 'test' },
    updated_by: { id: 'user-1', display_name: 'Test', display_name_url_id: 'test' },
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    hostname: {
      __entity_type: 'hostname',
      id: hostnameId,
      hostname: `${id}.example`,
      topic_id: id,
    },
  }
}

function makePage(
  id: string,
  hostnameId: string,
  hasNextPage: boolean,
): FediverseInstancesResponse {
  const topic = makeTopic(id, hostnameId)
  return {
    results: [
      { __entity_type: 'topic', id, name: topic.name, slug: id, topic_type: topic.topic_type },
    ],
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: hasNextPage ? 'next' : null,
      start_cursor: null,
    },
    topics: { [id]: topic },
    topics_metrics: {},
    fediverse_instances: {
      [id]: {
        software: id === 'topic-1' ? 'mastodon' : null,
        protocol: 'activitypub',
        nodeinfo_software_version: null,
        total_users: null,
        monthly_active_users: null,
        open_registrations: null,
      },
    },
    hostname_elections:
      id === 'topic-1'
        ? {
            [hostnameId]: {
              __entity_type: 'hostname_election',
              id: hostnameId,
              votes_score_net: 5,
              votes_count_up: 7,
              votes_count_down: 2,
            },
          }
        : {},
    topic_elections: {},
    markdown_to_html: {},
    bookmarks: {},
    election_votes: {},
  }
}

describe('TopicList fediverse sidecars', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedCardProps.length = 0
  })

  it('merges instance and hostname-election sidecars across pages', async () => {
    const page1 = makePage('topic-1', 'hostname-1', true)
    const page2 = makePage('topic-2', 'hostname-2', false)
    mockGetPaginatedPage.mockResolvedValueOnce(page2)

    render(
      <TopicList
        data={page1}
        nextPageEndpoint='/api/v1/fediverse/instances'
      />,
    )
    await act(receiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>)

    const first = capturedCardProps.find(p => (p.topic as Topic).id === 'topic-1')
    expect(first?.fediverseInstance).toEqual(page1.fediverse_instances['topic-1'])
    expect(first?.hostnameElection).toEqual(page1.hostname_elections['hostname-1'])
    const second = capturedCardProps.find(p => (p.topic as Topic).id === 'topic-2')
    expect(second?.fediverseInstance).toEqual(page2.fediverse_instances['topic-2'])
    expect(second?.hostnameElection).toBeUndefined()
  })

  it('sanitizes old continuation pages before projecting card props', async () => {
    const page1 = makePage('topic-1', 'hostname-1', true)
    const page2 = makePage('topic-2', 'hostname-2', false)
    const rawPage2 = {
      ...page2,
      topics_metrics: undefined,
      hostname_elections: undefined,
      fediverse_instances: {
        'topic-2': {
          ...page2.fediverse_instances['topic-2'],
          nodeinfo_raw: { secret: true },
          integration_status: 'approved',
        },
      },
    }
    mockGetPaginatedPage.mockResolvedValueOnce(rawPage2).mockResolvedValueOnce(page2)

    render(
      <TopicList
        data={page1}
        nextPageEndpoint='/api/v1/fediverse/instances'
        normalizeFediversePages
      />,
    )
    await act(receiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>)

    const second = capturedCardProps.find(p => (p.topic as Topic).id === 'topic-2')
    expect(second?.fediverseInstance).not.toHaveProperty('nodeinfo_raw')
    expect(second?.fediverseInstance).not.toHaveProperty('integration_status')
    expect(second?.hostnameElection).toBeUndefined()
    expect(mockGetPaginatedPage).toHaveBeenNthCalledWith(1, '/api/v1/fediverse/instances', {
      after: 'next',
    })
    expect(mockGetPaginatedPage).toHaveBeenNthCalledWith(2, '/api/v1/topics', {
      after: 'next',
      topic_types: 'fediverse_instance',
    })
  })
})
