import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TopicCommunitiesAside } from '../topic-communities-aside'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'
import type { Topic } from '@/types/topics'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'

const mockGetCurrentUser = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockGetCommunities = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/i18n/get-resolved-ui-locale'), () => ({
  getResolvedUiLocale: vi.fn<VitestLooseMock>(() => Promise.resolve('en')),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getCommunities: mockGetCommunities,
}))

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

vi.mock(import('../topic-communities-aside-streaming'), () => ({
  TopicCommunitiesAsideStreaming: () => <div data-testid='topic-communities-aside-streaming' />,
}))

vi.mock(import('@/components/tags/render-auth-gated-streaming'), () => ({
  renderAuthGatedStreaming: vi.fn<VitestLooseMock>(
    async ({ isAuthenticated, dataPromise, renderLoggedOut, renderStreaming }) => {
      if (!isAuthenticated) {
        const data = await dataPromise
        return renderLoggedOut(data)
      }
      return renderStreaming
    },
  ),
}))

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

describe('TopicCommunitiesAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetCommunities.mockResolvedValue(makeCommunityResponse(['c1']))
  })

  it('renders null for anonymous user when getCommunities resolves null', async () => {
    mockGetCommunities.mockResolvedValue(null)
    const ui = await TopicCommunitiesAside({ topic: makeTopic() })
    const { container } = render(ui)
    expect(container.firstChild).toBeNull()
  })

  it('renders null for anonymous user when communities list is empty', async () => {
    mockGetCommunities.mockResolvedValue(makeCommunityResponse([]))
    const ui = await TopicCommunitiesAside({ topic: makeTopic() })
    const { container } = render(ui)
    expect(container.firstChild).toBeNull()
  })

  it('renders TopicCommunitiesAsideContent for anonymous user with communities', async () => {
    mockGetCommunities.mockResolvedValue(makeCommunityResponse(['c1', 'c2']))
    const ui = await TopicCommunitiesAside({ topic: makeTopic() })
    render(ui)
    expect(screen.getByTestId('topic-communities-aside-content')).toBeDefined()
    expect(screen.getByTestId('topic-communities-aside-content').textContent).toBe('2')
  })

  it('renders streaming component for authenticated user', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', username: 'testuser' })
    const ui = await TopicCommunitiesAside({ topic: makeTopic() })
    render(ui)
    expect(screen.getByTestId('topic-communities-aside-streaming')).toBeDefined()
  })

  it('renders null when getCommunities throws (catch returns null)', async () => {
    mockGetCommunities.mockRejectedValue(new Error('Network error'))
    const ui = await TopicCommunitiesAside({ topic: makeTopic() })
    const { container } = render(ui)
    expect(container.firstChild).toBeNull()
  })
})
