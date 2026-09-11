/* oxlint-disable jest/no-untyped-mock-factory, vitest/prefer-import-in-mock -- typed dynamic mock factories are too strict for this partial test mock */
import { beforeEach, describe, it, expect, vi } from 'vitest'

import type { ReactNode } from 'react'

import { render, screen } from '@testing-library/react'

import { TopicCard } from '../topic-card'

import type { Topic } from '@/types/topics'

import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

vi.mock('next/link', () => ({
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
}))

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

vi.mock('next/dynamic', () => nextDynamicMock)

vi.mock('@/components/votes/score-vote', () => ({
  ScoreVote: () => <div data-testid='topic-score-vote' />,
}))

vi.mock('@/components/shared/follow-button', () => ({
  FollowButton: () => (
    <button
      type='button'
      data-testid='follow-button'
      aria-label='Follow topic'
    />
  ),
}))

vi.mock('@/components/shared/entity-bookmark-button', () => ({
  EntityBookmarkButton: () => (
    <button
      type='button'
      data-testid='mute-button'
      aria-label='Mute topic'
    />
  ),
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    currentUser: mockCurrentUser,
    isAuthenticated: mockCurrentUser !== null,
    logout: vi.fn<() => Promise<void>>(),
    setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
  }),
}))

vi.mock('@/components/shared/topic-logo', () => ({
  TopicLogo: ({ name }: { name: string }) => {
    const React = require('react')
    return React.createElement('img', {
      alt: `${name} logo`,
      src: '/topic-logo.png',
    })
  },
}))

describe('TopicCard — fediverse_instance', () => {
  beforeEach(() => {
    mockCurrentUser = null
  })

  const mockInstanceTopic: Topic = {
    __entity_type: 'topic',
    id: 'topic-instance-1',
    name: 'mastodon.example',
    slug: 'mastodon-example',
    markdown: '',
    aliases: [],
    topic_type: 'fediverse_instance',
    noindex: false,
    allow_reviews: false,
    created_at: '2024-01-15T10:00:00Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    hostname: {
      __entity_type: 'hostname',
      id: 'hostname-1',
      hostname: 'mastodon.example',
      topic_id: null,
    },
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

  it('renders the "Unclassified" software-row fallback', () => {
    render(<TopicCard topic={mockInstanceTopic} />)
    expect(screen.getByText('Unclassified')).toBeDefined()
  })

  it('renders classified software and version with a rated trust badge', () => {
    render(
      <TopicCard
        topic={mockInstanceTopic}
        fediverseInstance={{
          software: 'mastodon',
          protocol: 'activitypub',
          nodeinfo_software_version: '4.4.0',
          total_users: 1200,
          monthly_active_users: 340,
          open_registrations: true,
        }}
        hostnameElection={{
          __entity_type: 'hostname_election',
          id: 'hostname-1',
          votes_score_net: 10,
          votes_count_up: 12,
          votes_count_down: 2,
        }}
      />,
    )
    expect(screen.getByText('mastodon 4.4.0')).toBeDefined()
    expect(screen.getByText('Trusted')).toBeDefined()
    expect(screen.queryByText('Unclassified')).toBeNull()
  })

  it('renders a trust badge showing "Unrated" when no hostnameElection is supplied', () => {
    render(<TopicCard topic={mockInstanceTopic} />)
    expect(screen.getByText('Unrated')).toBeDefined()
  })

  it('falls back to a plain "Unrated" link when the topic has no hostname', () => {
    render(<TopicCard topic={{ ...mockInstanceTopic, hostname: null }} />)
    const unratedLink = screen.getByRole('link', { name: 'Unrated' })
    expect(unratedLink.getAttribute('href')).toBe('/instance/mastodon-example')
  })

  it('does not render the fediverse row for other topic types', () => {
    render(<TopicCard topic={{ ...mockInstanceTopic, topic_type: 'card', hostname: null }} />)
    expect(screen.queryByText('Unclassified')).toBeNull()
  })
})
