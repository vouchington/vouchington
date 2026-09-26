import type { ReactNode } from 'react'
import { configure } from '@testing-library/react'
import { vi } from 'vitest'

configure({ testIdAttribute: 'data-pw' })

import type { Topic, TopicMetrics } from '@/types/topics'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

export function setTopicCardUser(user: User | null) {
  mockCurrentUser = user
}

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

// Resolve next/dynamic synchronously so dynamic imports work in jsdom.
const nextDynamicMock = vi.hoisted(() => {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      // oxlint-disable-next-line react/only-export-components -- next/dynamic test double, never fast-refreshed
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

vi.mock(
  import('@/components/votes/score-vote'),
  () =>
    ({
      ScoreVote: (props: Record<string, unknown>) => {
        return (
          <div
            data-pw='topic-score-vote'
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
      data-pw='follow-button'
      aria-label='Follow topic'
    />
  ),
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => (
    <button
      type='button'
      data-pw='mute-button'
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
        setUser: vi.fn<(user: User | null) => void>(),
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

export const mockTopic: Topic = {
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

export const mockMetrics: TopicMetrics = {
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
