import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { PostAuthorAside } from '../post-author-aside'
import type { AuthorAside } from '@/types/posts'
import type { ProfileLink } from '@/types/user'

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

vi.mock(
  import('@/components/shared/follow-button'),
  () =>
    ({
      FollowButton: ({
        entityId,
        currentUserId,
      }: {
        entityId: string
        currentUserId: string | null
      }) => (
        <button
          type='button'
          data-entity={entityId}
          data-user={currentUserId ?? ''}
        >
          Follow
        </button>
      ),
    }) as unknown as typeof import('@/components/shared/follow-button'),
)

const author = {
  __entity_type: 'user' as const,
  id: 'author-1',
  username: 'story-teller',
  profile_image_id: null,
}

const makeAside = (overrides: Partial<AuthorAside> = {}): AuthorAside => ({
  about_html: '',
  profile_links: [],
  is_following: false,
  ...overrides,
})

describe('PostAuthorAside', () => {
  it('renders linked username', async () => {
    render(
      await PostAuthorAside({
        author,
        aside: makeAside(),
        postType: 'discussion',
      }),
    )
    const link = screen.getByRole('link', { name: /story-teller/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/user/story-teller')
  })

  it('renders bio and Read more when about_html non-empty', async () => {
    render(
      await PostAuthorAside({
        author,
        aside: makeAside({ about_html: '<p>Hello world</p>' }),
        postType: 'discussion',
      }),
    )
    expect(screen.getByText('Hello world')).toBeDefined()
    expect(screen.getByText('Read more →')).toBeDefined()
  })

  it('adds outbound UTM params to external links in the bio', async () => {
    render(
      await PostAuthorAside({
        author,
        aside: makeAside({ about_html: '<p><a href="https://example.com/me">Profile</a></p>' }),
        postType: 'discussion',
      }),
    )

    const link = screen.getByRole('link', { name: 'Profile' })
    await waitFor(() => {
      expect(link).toHaveAttribute(
        'href',
        'https://example.com/me?utm_source=voucha.ai&utm_medium=referral',
      )
    })
  })

  it('hides Read more when about_html empty', async () => {
    render(
      await PostAuthorAside({
        author,
        aside: makeAside(),
        postType: 'discussion',
      }),
    )
    expect(screen.queryByText('Read more →')).toBeNull()
  })

  it('shows FollowButton for other viewers', async () => {
    render(
      await PostAuthorAside({
        author,
        aside: makeAside(),
        postType: 'discussion',
      }),
    )
    expect(await screen.findByRole('button', { name: 'Follow' })).toBeDefined()
  })

  it('hides FollowButton when viewing own post', async () => {
    render(
      await PostAuthorAside({
        author,
        aside: makeAside(),
        postType: 'discussion',
      }),
    )
    expect(screen.queryByRole('button', { name: 'Follow' })).toBeNull()
  })

  it('renders social links for non-empty profile_links', async () => {
    const links: ProfileLink[] = [
      {
        id: 'link-1',
        user_id: 'author-1',
        link_type: 'github',
        sort_order: 0,
        url: null,
        handle: 'octocat',
        name: null,
        image_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]
    render(
      await PostAuthorAside({
        author,
        aside: makeAside({ profile_links: links }),
        postType: 'discussion',
      }),
    )
    const githubLink = screen.getByRole('link', { name: 'GitHub' })
    expect(githubLink).toBeDefined()
    expect((githubLink as HTMLAnchorElement).href).toContain('github.com/octocat')
  })

  it('hides social section for empty profile_links', async () => {
    render(
      await PostAuthorAside({
        author,
        aside: makeAside(),
        postType: 'discussion',
      }),
    )
    expect(screen.queryByRole('link', { name: 'GitHub' })).toBeNull()
  })
})
