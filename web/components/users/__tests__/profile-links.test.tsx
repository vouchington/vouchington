import { beforeAll, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { UserProfileLinks } from '../profile-links'
import type { useTranslations } from '@/lib/i18n/use-translations'
import type { ProfileLink } from '@/types/user'

function makeLink(overrides: Partial<ProfileLink> = {}): ProfileLink {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    link_type: 'url',
    sort_order: 0,
    url: null,
    handle: null,
    name: null,
    image_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('UserProfileLinks', () => {
  let t: ReturnType<typeof useTranslations>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('renders badge links with existing hrefs, labels, rel values, and data-pw hooks', () => {
    render(
      UserProfileLinks({
        variant: 'badges',
        t,
        links: [
          makeLink({ id: 'twitter', link_type: 'twitter', handle: 'jongleberry' }),
          makeLink({ id: 'github', link_type: 'github', handle: 'octocat' }),
          makeLink({
            id: 'site',
            link_type: 'url',
            url: 'https://example.com',
            name: 'My Site',
          }),
        ],
      }),
    )

    const twitter = screen.getByRole('link', { name: 'jongleberry' })
    expect(twitter.getAttribute('href')).toBe('https://x.com/jongleberry')
    expect(twitter.getAttribute('target')).toBe('_blank')
    expect(twitter.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    expect(twitter.getAttribute('data-pw')).toBe('profile-link-badge')
    expect(screen.getByRole('link', { name: 'My Site' }).getAttribute('href')).toBe(
      'https://example.com',
    )
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('renders icon links with existing hrefs, fallback labels, rel values, and data-pw hooks', () => {
    const { container } = render(
      UserProfileLinks({
        variant: 'icons',
        t,
        links: [
          makeLink({ id: 'github', link_type: 'github', handle: 'octocat' }),
          makeLink({ id: 'twitter', link_type: 'twitter', handle: 'jack' }),
          makeLink({ id: 'site', link_type: 'url', url: 'https://example.com' }),
        ],
      }),
    )

    expect(container.querySelector('[data-pw="profile-link-icons"]')).not.toBeNull()
    const github = screen.getByRole('link', { name: 'GitHub' })
    expect(github.getAttribute('href')).toBe('https://github.com/octocat')
    expect(github.getAttribute('target')).toBe('_blank')
    expect(github.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    expect(github.getAttribute('data-pw')).toBe('profile-link-github')
    expect(github.className).toContain('size-11')
    expect(screen.getByRole('link', { name: 'X / Twitter' }).getAttribute('href')).toBe(
      'https://x.com/jack',
    )
    expect(screen.getByRole('link', { name: 'Website' }).getAttribute('href')).toBe(
      'https://example.com',
    )
  })

  it('renders icon links with custom names when provided', () => {
    render(
      UserProfileLinks({
        variant: 'icons',
        t,
        links: [makeLink({ link_type: 'url', url: 'https://example.com', name: 'Portfolio' })],
      }),
    )

    expect(screen.getByRole('link', { name: 'Portfolio' }).getAttribute('href')).toBe(
      'https://example.com',
    )
  })

  it('renders nothing when links resolve to no hrefs', () => {
    const { container, rerender } = render(
      UserProfileLinks({
        variant: 'badges',
        t,
        links: [makeLink({ link_type: 'twitter', handle: null })],
      }),
    )
    expect(container.firstChild).toBeNull()

    rerender(
      UserProfileLinks({
        variant: 'icons',
        t,
        links: [],
      }),
    )
    expect(container.firstChild).toBeNull()
  })
})
