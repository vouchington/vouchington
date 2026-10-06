import { configure, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createNextDynamicMock,
  createNextLinkMock,
} from '@/test-helpers/components/topics/next-link-dynamic-mocks'
import { makeTopic } from '@/test-helpers/api-responses/topics'
import { TopicDetailHeader } from '../topic-detail-header'

configure({ testIdAttribute: 'data-pw' })

vi.mock(import('next/link'), () => createNextLinkMock())

vi.mock(import('next/dynamic'), () => createNextDynamicMock())

// The dynamic() loader imports FollowButton. Stub it so that import does not pull in
// login-url.ts, which can still be loading when Vitest tears the environment down.
vi.mock(import('@/components/shared/follow-button'), () => ({ FollowButton: () => null }))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ currentUser: null, isAuthenticated: false }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('@/components/topics/topic-vouch-disavow-vote'),
  () =>
    ({
      TopicVouchDisavowVote: () => null,
    }) as unknown as typeof import('@/components/topics/topic-vouch-disavow-vote'),
)

vi.mock(
  import('@/components/shared/topic-logo'),
  () =>
    ({
      TopicLogo: () => null,
    }) as unknown as typeof import('@/components/shared/topic-logo'),
)

const staffClient = {
  client_id: 'voucha_fixture_agent',
  client_name: 'Fixture Agent',
  metadata_url: null,
  verified: true,
}

const topicProvenance = {
  provenance: { via: 'mcp', app: null },
  staff_provenance: { created_via: 'mcp', oauth_client: staffClient },
} as const

const feedProvenance = {
  provenance: { via: 'api', app: null },
  staff_provenance: {
    created_via: 'api',
    oauth_client: { ...staffClient, client_id: 'voucha_feed_agent', client_name: 'Feed Agent' },
  },
} as const

const header = () => within(screen.getByTestId('topic-detail-header'))

describe('provenance on the topic detail header', () => {
  it('shows a topic its own label, channel, client and verification', () => {
    render(<TopicDetailHeader topic={makeTopic({ topic_type: 'card', ...topicProvenance })} />)

    expect(header().getByTestId('topic-provenance-badge')).toHaveTextContent('via MCP')
    expect(header().getByTestId('topic-provenance-channel')).toHaveTextContent('Channel: mcp')
    expect(header().getByTestId('topic-provenance-client')).toHaveTextContent('Fixture Agent')
    expect(header().getByTestId('topic-provenance-client-verification')).toHaveTextContent(
      'Verified',
    )
    expect(header().queryByTestId('source-provenance-badge')).toBeNull()
  })

  it('shows a source page the feed provenance once, never the topic row', () => {
    render(
      <TopicDetailHeader
        topic={makeTopic({ topic_type: 'rss_feed', ...topicProvenance })}
        sourceFeed={feedProvenance}
      />,
    )

    expect(header().getByTestId('source-provenance-badge')).toHaveTextContent('via API')
    expect(header().getByTestId('source-provenance-channel')).toHaveTextContent('Channel: api')
    expect(header().getByTestId('source-provenance-client')).toHaveTextContent('Feed Agent')
    expect(header().queryByTestId('topic-provenance-badge')).toBeNull()
    expect(header().queryByText('via MCP')).toBeNull()
  })

  it('shows a source page nothing when no feed was loaded for it', () => {
    render(<TopicDetailHeader topic={makeTopic({ topic_type: 'rss_feed', ...topicProvenance })} />)

    expect(header().queryByTestId('source-provenance-badge')).toBeNull()
    expect(header().queryByTestId('topic-provenance-badge')).toBeNull()
  })

  it('shows no provenance for a topic created on the web', () => {
    render(<TopicDetailHeader topic={makeTopic({ topic_type: 'card' })} />)

    expect(header().queryByTestId('topic-provenance-badge')).toBeNull()
    expect(header().queryByTestId('topic-provenance-channel')).toBeNull()
  })
})
