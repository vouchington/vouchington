import { beforeEach, describe, it, expect, vi } from 'vitest'

import type { ReactNode } from 'react'

import { render, screen } from '@testing-library/react'

import { TopicCard } from '../topic-card'

import type { Topic, TopicElection, TopicMetrics } from '@/types/topics'

import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
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

// Resolve next/dynamic synchronously so dynamic imports work in jsdom
const nextDynamicMock = vi.hoisted(() => {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      function MockDynamic(props: Record<string, unknown>) {
        const [dynamicComponent, setDynamicComponent] = React.useState(null)
        React.useEffect(() => {
          let active = true
          void loader().then((mod: unknown) => {
            if (active)
              setDynamicComponent(() =>
                typeof mod === 'function' ? mod : (mod as Record<string, unknown>).default,
              )
          })
          return () => {
            active = false
          }
        }, [])
        return dynamicComponent ? React.createElement(dynamicComponent, props) : null
      },
  }
})

vi.mock(import('next/dynamic'), () => nextDynamicMock as unknown as typeof import('next/dynamic'))

// Capture props passed to the vote button for assertions
let mockLastVoteButtonProps: Record<string, unknown> | null = null

vi.mock(
  import('@/components/votes/score-vote'),
  () =>
    ({
      ScoreVote: (props: Record<string, unknown>) => {
        mockLastVoteButtonProps = props
        return (
          <div
            data-testid='topic-score-vote'
            data-election-id={props.electionId as string}
            data-count-up={String(props.countUp)}
            data-count-down={String(props.countDown)}
            data-existing-vote-choice={String(props.existingVoteChoice ?? '')}
          />
        )
      },
    }) as unknown as typeof import('@/components/votes/score-vote'),
)

vi.mock(import('@/components/shared/follow-button'), () => ({
  FollowButton: () => (
    <button
      type='button'
      data-testid='follow-button'
      aria-label='Follow topic'
    />
  ),
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => (
    <button
      type='button'
      data-testid='mute-button'
      aria-label='Mute topic'
    />
  ),
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/components/shared/topic-logo'), () => ({
  TopicLogo: ({ name }: { name: string }) => {
    const React = require('react')
    return React.createElement('img', {
      alt: `${name} logo`,
      src: '/topic-logo.png',
    })
  },
}))

describe('TopicCard', () => {
  beforeEach(() => {
    mockCurrentUser = null
  })

  const mockTopic: Topic = {
    __entity_type: 'topic',
    id: 'topic-1',
    name: 'Chase Sapphire Reserve',
    slug: 'chase-sapphire-reserve',
    markdown: 'Premium travel rewards credit card with excellent benefits.',
    aliases: [],
    topic_type: 'card',
    noindex: false,
    allow_reviews: true,
    created_at: '2024-01-15T10:00:00Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: {
      id: 'user-1',
      display_name: 'John Doe',
      display_name_url_id: 'john-doe',
    },
    updated_by: {
      id: 'user-1',
      display_name: 'John Doe',
      display_name_url_id: 'john-doe',
    },
  }

  const mockMetrics: TopicMetrics = {
    __entity_type: 'topic_metrics',
    id: 'topic-1',
    count: {
      discussions: 10,
      reviews: 20,
      'data-points': 5,
      news: 2,
      latest: 0,
    },
    ratings: {
      count: {
        '1': 0,
        '2': 1,
        '3': 2,
        '4': 5,
        '5': 12,
      },
    },
    ratings__updated_at: '2024-01-15T10:00:00Z',
    bookmarks: {
      follow: 150,
    },
    bookmarks__updated_at: '2024-01-15T10:00:00Z',
  }

  const mockElection: TopicElection = {
    __entity_type: 'topic_election',
    id: 'topic-election-1',
    votes_score_net: 5,
    votes_count_up: 12,
    votes_count_down: 7,
  }

  it('renders vote button for anonymous viewers with signedOut=true', () => {
    render(
      <TopicCard
        topic={mockTopic}
        election={mockElection}
      />,
    )
    const vote = screen.queryByTestId('topic-score-vote')
    expect(vote).not.toBeNull()
    expect(mockLastVoteButtonProps!.signedOut).toBe(true)
  })

  it('does not render vote button when election is absent', () => {
    render(<TopicCard topic={mockTopic} />)
    expect(screen.queryByTestId('topic-score-vote')).toBeNull()
  })

  it('renders ScoreVote with election counts for authenticated users', async () => {
    mockLastVoteButtonProps = null
    mockCurrentUser = { id: 'user-1' } as User
    render(
      <TopicCard
        topic={mockTopic}
        election={mockElection}
      />,
    )

    await screen.findByTestId('topic-score-vote')

    expect(mockLastVoteButtonProps).not.toBeNull()
    expect(mockLastVoteButtonProps!.electionId).toBe('topic-election-1')
    expect(mockLastVoteButtonProps!.countUp).toBe(12)
    expect(mockLastVoteButtonProps!.countDown).toBe(7)
  })

  it('passes electionVoteChoice to the vote button when provided', async () => {
    mockLastVoteButtonProps = null
    mockCurrentUser = { id: 'user-1' } as User
    render(
      <TopicCard
        topic={mockTopic}
        election={mockElection}
        electionVoteChoice='vouch'
      />,
    )

    await screen.findByTestId('topic-score-vote')

    expect(mockLastVoteButtonProps!.existingVoteChoice).toBe('vouch')
  })
})
