import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { TopicCommunitiesAsideContent } from '../topic-communities-aside-content'
import { makeCommunity, makeCommunityMetrics } from '@/test-helpers/api-responses/communities'
import type { Topic } from '@/types/topics'
import type { Community, CommunityMetrics } from '@/types/api-responses'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: React.ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1',
    topic_type: 'card',
    name: 'Test Topic',
    slug: 'test-topic',
    referral_program_id: null,
    ...overrides,
  } as Topic
}

const baseCommunity: Community = makeCommunity({
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Finance Community',
  slug: 'finance-community',
  markdown: null,
  created_by_id: 'owner-uuid',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
})

const baseMetrics: CommunityMetrics = makeCommunityMetrics({
  id: baseCommunity.id,
  member_count: 42,
  post_count: 7,
  list_item_count: 3,
  virtual_subscription_count: 42,
})

describe('TopicCommunitiesAsideContent', () => {
  let t: ReturnType<typeof createTranslator>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('renders null when communities list is empty', () => {
    const { container } = render(
      <TopicCommunitiesAsideContent
        topic={makeTopic()}
        communities={[]}
        communityMetrics={{}}
        t={t}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders Communities about this topic heading when communities are present', () => {
    render(
      <TopicCommunitiesAsideContent
        topic={makeTopic()}
        communities={[baseCommunity]}
        communityMetrics={{ [baseCommunity.id]: baseMetrics }}
        t={t}
      />,
    )
    expect(screen.getByText('Communities about this topic')).toBeDefined()
  })

  it('renders aside with data-pw attribute', () => {
    const { container } = render(
      <TopicCommunitiesAsideContent
        topic={makeTopic()}
        communities={[baseCommunity]}
        communityMetrics={{}}
        t={t}
      />,
    )
    expect(container.querySelector('[data-pw="topic-communities-aside"]')).not.toBeNull()
  })

  it('renders a See all link with correct href using topic slug', () => {
    render(
      <TopicCommunitiesAsideContent
        topic={makeTopic({ slug: 'test-topic' })}
        communities={[baseCommunity]}
        communityMetrics={{}}
        t={t}
      />,
    )
    const seeAll = screen.getByRole('link', { name: 'See all' })
    expect(seeAll.getAttribute('href')).toBe('/communities?q=%23test-topic')
  })

  it('renders See all link with data-pw attribute', () => {
    const { container } = render(
      <TopicCommunitiesAsideContent
        topic={makeTopic()}
        communities={[baseCommunity]}
        communityMetrics={{}}
        t={t}
      />,
    )
    expect(container.querySelector('[data-pw="topic-communities-aside-see-all"]')).not.toBeNull()
  })

  it('renders community name as a link to the community page', () => {
    render(
      <TopicCommunitiesAsideContent
        topic={makeTopic()}
        communities={[baseCommunity]}
        communityMetrics={{}}
        t={t}
      />,
    )
    const link = screen.getByRole('link', { name: /Finance Community/ })
    expect(link.getAttribute('href')).toBe('/communities/finance-community')
  })

  it('renders member count when metrics are provided', () => {
    render(
      <TopicCommunitiesAsideContent
        topic={makeTopic()}
        communities={[baseCommunity]}
        communityMetrics={{ [baseCommunity.id]: baseMetrics }}
        t={t}
      />,
    )
    expect(screen.getByText(/42 members/)).toBeDefined()
  })

  it('omits member count when no metrics are provided for the community', () => {
    render(
      <TopicCommunitiesAsideContent
        topic={makeTopic()}
        communities={[baseCommunity]}
        communityMetrics={{}}
        t={t}
      />,
    )
    expect(screen.queryByText(/members/)).toBeNull()
  })
})
