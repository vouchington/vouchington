import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopicCommunitiesAsideStreaming } from '../topic-communities-aside-streaming'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'
import type { Topic } from '@/types/topics'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'

vi.mock(
  import('../topic-communities-aside-content'),
  () =>
    ({
      TopicCommunitiesAsideContent: ({
        communities,
      }: {
        communities: { name: string }[]
        [k: string]: unknown
      }) => <div data-testid='topic-communities-aside-content'>{communities.length}</div>,
    }) as unknown as typeof import('../topic-communities-aside-content'),
)

function makeTopic(): Topic {
  return {
    __entity_type: 'topic',
    id: 'topic-1',
    name: 'Test Topic',
    slug: 'test-topic',
    markdown: '',
    aliases: [],
    topic_type: 'card',
    created_at: '2024-01-01T00:00:00.000Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: { id: 'user-1', username: 'u', display_account: null },
    updated_by: { id: 'user-1', username: 'u', display_account: null },
  } as unknown as Topic
}

function makeCommunityResponse(communityIds: string[]): CommunitiesSearchResponseBody {
  return makeCommunitiesSearchResponse({
    communities: communityIds.map(id =>
      makeCommunity({
        id,
        name: `Community ${id}`,
        slug: `community-${id}`,
        markdown: null,
        created_by_id: 'owner',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      }),
    ),
    communityMetrics: {},
  })
}

describe('TopicCommunitiesAsideStreaming', () => {
  it('renders null when response promise resolves to null', async () => {
    const responsePromise = Promise.resolve(null)
    const { container } = render(
      <Suspense fallback={null}>
        <TopicCommunitiesAsideStreaming
          topic={makeTopic()}
          responsePromise={responsePromise}
        />
      </Suspense>,
    )
    await act(async () => {
      await responsePromise
    })
    expect(container.firstChild).toBeNull()
  })

  it('renders null when response has no communities', async () => {
    const responsePromise = Promise.resolve(makeCommunityResponse([]))
    const { container } = render(
      <Suspense fallback={null}>
        <TopicCommunitiesAsideStreaming
          topic={makeTopic()}
          responsePromise={responsePromise}
        />
      </Suspense>,
    )
    await act(async () => {
      await responsePromise
    })
    expect(container.firstChild).toBeNull()
  })

  it('renders TopicCommunitiesAsideContent when communities are present', async () => {
    const responsePromise = Promise.resolve(makeCommunityResponse(['c1', 'c2']))
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <TopicCommunitiesAsideStreaming
            topic={makeTopic()}
            responsePromise={responsePromise}
          />
        </Suspense>,
      )
      await responsePromise
    })
    expect(screen.getByTestId('topic-communities-aside-content')).toBeDefined()
    expect(screen.getByTestId('topic-communities-aside-content').textContent).toBe('2')
  })
})
