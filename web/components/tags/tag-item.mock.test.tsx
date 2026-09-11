import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TagItem } from './tag-item'
import type { EntityRelation } from '@/lib/api/entity-relations'
import { AuthProvider } from '@/lib/auth/auth-provider'

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

function makeRelation(overrides: Partial<EntityRelation> = {}): EntityRelation {
  return {
    id: 'rel-1',
    object_id: 'obj-1',
    created_at: '2024-01-01T00:00:00Z',
    created_by_id: 'user-1',
    votes_count_up: 2,
    votes_count_down: 0,
    object_data: {},
    ...overrides,
  }
}

describe('TagItem — topic', () => {
  it('shows humanized topic type label', () => {
    const relation = makeRelation({
      object_data: { id: 'topic-1', name: 'Chase', topic_type: 'card' },
    })
    render(
      <TagItem
        relation={relation}
        objectType='topic'
      />,
    )
    expect(screen.getByText('Chase')).toBeDefined()
    expect(screen.getByText('Card')).toBeDefined()
  })

  it('falls back to "Topic" label for generic topic type', () => {
    const relation = makeRelation({
      object_data: { id: 'topic-2', name: 'Misc', topic_type: 'topic' },
    })
    render(
      <TagItem
        relation={relation}
        objectType='topic'
      />,
    )
    expect(screen.getByText('Topic')).toBeDefined()
  })
})

describe('TagItem — post', () => {
  it('shows humanized post type label', () => {
    const relation = makeRelation({
      object_data: { id: 'post-1', title: 'My Post', post_type: 'discussion', slug: 'my-post' },
    })
    render(
      <TagItem
        relation={relation}
        objectType='post'
      />,
    )
    expect(screen.getByText('My Post')).toBeDefined()
    expect(screen.getByText('Discussion')).toBeDefined()
  })

  it('shows Story label for story posts', () => {
    const relation = makeRelation({
      object_data: { id: 'post-2', title: 'My Story', post_type: 'story', slug: 'my-story' },
    })
    render(
      <TagItem
        relation={relation}
        objectType='post'
      />,
    )
    expect(screen.getByText('Story')).toBeDefined()
  })
})

describe('TagItem — url', () => {
  it('does not render a type-label badge for URL relations', () => {
    const relation = makeRelation({
      object_data: {
        id: 'url-1',
        url: 'https://www.techradar.com/article',
        latest_crawl: null,
      },
    })
    const { container } = render(
      <TagItem
        relation={relation}
        objectType='url'
      />,
    )
    const badges = container.querySelectorAll('[data-slot="badge"]')
    expect(badges.length).toBe(0)
  })

  it('renders crawl title when crawl data is present', () => {
    const relation = makeRelation({
      object_data: {
        id: 'url-2',
        url: 'https://www.techradar.com/article',
        latest_crawl: { title: 'Tech Article', image_url: null },
      },
    })
    render(
      <TagItem
        relation={relation}
        objectType='url'
      />,
    )
    expect(screen.getByText('Tech Article')).toBeDefined()
  })

  it('renders stripped url fallback when no crawl', () => {
    const relation = makeRelation({
      object_data: {
        id: 'url-3',
        url: 'https://www.techradar.com/article/slug',
        latest_crawl: null,
      },
    })
    render(
      <TagItem
        relation={relation}
        objectType='url'
      />,
    )
    const link = screen.getByRole('link')
    expect(link.textContent).toContain('techradar.com')
    expect(link.textContent).not.toContain('www.')
  })
})

describe('TagItem — layout contract', () => {
  it('outer flex row has min-w-0 so URL rows can shrink inside a narrow aside', () => {
    const relation = makeRelation({
      object_data: { id: 'url-lc', url: 'https://example.com/very/long/path', latest_crawl: null },
    })
    const { container } = render(
      <TagItem
        relation={relation}
        objectType='url'
      />,
    )
    const row = container.firstChild as HTMLElement
    expect(row.className).toContain('min-w-0')
  })
})

describe('TagItem — voting', () => {
  it('renders semantic vote controls on the left when showVoting is true', () => {
    const relation = makeRelation({
      object_data: { id: 'topic-3', name: 'Test', topic_type: 'topic' },
    })
    const { container } = render(
      <TagItem
        relation={relation}
        objectType='topic'
        showVoting
        isAuthenticated
      />,
    )
    const row = container.firstChild as HTMLElement
    const firstChild = row.firstChild as HTMLElement
    // ScoreVote should be the first element in the row
    expect(firstChild.getAttribute('data-vote-root')).toBe('tag-vote')
  })

  it('shows raw voter counts without rendering the weighted net score', () => {
    const relation = makeRelation({
      votes_score_net: 12,
      object_data: { id: 'topic-3', name: 'Test', topic_type: 'topic' },
    })
    render(
      <TagItem
        relation={relation}
        objectType='topic'
        showVoting
        isAuthenticated
      />,
    )

    expect(document.querySelector('[data-pw="vote-count-up"]')).toHaveTextContent('+2 −0')
    expect(screen.queryByText('12')).toBeNull()
  })

  it('prevents a non-admin official account from creating a user-tag vote but lets it clear one', () => {
    const relation = makeRelation({
      object_data: { id: 'topic-3', name: 'Test', topic_type: 'topic' },
    })
    const { unmount } = render(
      <AuthProvider
        initialUser={{ id: 'official-1', roles: ['investor'], isOfficialAccount: true }}
      >
        <TagItem
          relation={relation}
          objectType='topic'
          showVoting
          isAuthenticated
          allowOfficialAccounts={false}
        />
      </AuthProvider>,
    )

    expect(document.querySelector('[data-vote-root="tag-vote"]')).toBeNull()

    unmount()
    render(
      <AuthProvider
        initialUser={{ id: 'official-1', roles: ['investor'], isOfficialAccount: true }}
      >
        <TagItem
          relation={relation}
          objectType='topic'
          showVoting
          isAuthenticated
          existingVoteChoice='confirm'
          allowOfficialAccounts={false}
        />
      </AuthProvider>,
    )

    expect(document.querySelector('[data-vote-clear-for="tag-vote"]')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dispute' })).toBeNull()
  })

  it('allows an administrator official account to create and clear a user-tag vote', () => {
    const relation = makeRelation({
      object_data: { id: 'topic-3', name: 'Test', topic_type: 'topic' },
    })
    render(
      <AuthProvider
        initialUser={{ id: 'admin-1', roles: ['administrator'], isOfficialAccount: true }}
      >
        <TagItem
          relation={relation}
          objectType='topic'
          showVoting
          isAuthenticated
          existingVoteChoice='confirm'
          allowOfficialAccounts
        />
      </AuthProvider>,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dispute' })).toBeInTheDocument()
    expect(document.querySelector('[data-vote-clear-for="tag-vote"]')).toBeInTheDocument()
  })
})
