import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SlugAvailability } from './slug-availability'
import type { AvailabilityState } from '@/hooks/use-availability-check'
import type { AvailabilityConflict } from '@/lib/api/client/availability'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

function takenState(conflict: AvailabilityConflict | null): AvailabilityState {
  return { status: 'taken', conflict }
}

describe('SlugAvailability', () => {
  it('renders a topic conflict link via topicHref', () => {
    render(
      <SlugAvailability
        kind='topic-slug'
        state={takenState({
          kind: 'topic',
          id: 't1',
          slug: 'dev-tools',
          name: 'Dev Tools',
          topic_type: 'topic',
        })}
      />,
    )
    const link = screen.getByRole('link', { name: 'Dev Tools' })
    expect(link).toHaveAttribute('href', '/topic/dev-tools')
    expect(screen.getByText('topic slug used:')).toBeInTheDocument()
  })

  it('renders a community conflict link via communityHref', () => {
    render(
      <SlugAvailability
        kind='community-slug'
        state={takenState({ kind: 'community', id: 'c1', slug: 'my-club', name: 'My Club' })}
      />,
    )
    expect(screen.getByRole('link', { name: 'My Club' })).toHaveAttribute(
      'href',
      '/communities/my-club',
    )
  })

  it('renders a post conflict link via getCanonicalPostPath', () => {
    render(
      <SlugAvailability
        kind='post-slug'
        state={takenState({
          kind: 'post',
          id: 'p1',
          slug: 'great-post',
          title: 'Great Post',
          post_type: 'discussion',
        })}
      />,
    )
    const link = screen.getByRole('link', { name: 'Great Post' })
    expect(link.getAttribute('href')).toContain('great-post')
  })

  it('falls back to the slug as the post link label when title is empty', () => {
    render(
      <SlugAvailability
        kind='post-slug'
        state={takenState({
          kind: 'post',
          id: 'p1',
          slug: 'slug-only',
          title: '',
          post_type: 'discussion',
        })}
      />,
    )
    expect(screen.getByRole('link', { name: 'slug-only' })).toBeInTheDocument()
  })

  it('renders the plain taken message for a username with no conflict', () => {
    render(
      <SlugAvailability
        kind='username'
        state={takenState(null)}
      />,
    )
    expect(screen.getByText('username is already taken')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
