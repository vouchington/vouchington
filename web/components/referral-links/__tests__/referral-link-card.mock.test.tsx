import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReferralLinkCard } from '../referral-link-card'
import type { PrioritizedReferralLink, ReferralLinkUser } from '@/types/api-responses'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

function makeLink(overrides?: Partial<PrioritizedReferralLink>): PrioritizedReferralLink {
  return {
    id: 'link-1',
    user_id: 'user-1',
    is_official: false,
    referral_program_id: 'rp-1',
    url: 'https://example.com/ref/abc',
    label: 'My Referral Link',
    priority_group: 5,
    contribution_rank: 3,
    tier_rank: 3,
    best_score: 0,
    review_post_id: null,
    review_post_slug: null,
    review_avg_rating: null,
    ...overrides,
  }
}

function makeUser(): ReferralLinkUser {
  return { id: 'user-1', username: 'johndoe', display_name: 'John Doe' }
}

describe('ReferralLinkCard', () => {
  it('renders the label as a clickable ExternalLink and an Open link', () => {
    render(
      <ReferralLinkCard
        link={makeLink()}
        user={makeUser()}
      />,
    )
    const labelLink = screen.getByRole('link', { name: 'My Referral Link' })
    expect(labelLink).toHaveAttribute('href', 'https://example.com/ref/abc')
    expect(labelLink).toHaveAttribute('target', '_blank')
    expect(labelLink).toHaveAttribute('rel', 'nofollow ugc noopener noreferrer')

    const openLink = screen.getByRole('link', { name: 'Open' })
    expect(openLink).toHaveAttribute('href', 'https://example.com/ref/abc')
    expect(openLink).toHaveAttribute('target', '_blank')
  })

  it('renders the user name', () => {
    render(
      <ReferralLinkCard
        link={makeLink()}
        user={makeUser()}
      />,
    )
    expect(screen.getByText('by John Doe')).toBeInTheDocument()
  })

  it('does not render review link when review_post_id is null', () => {
    render(<ReferralLinkCard link={makeLink()} />)
    // Only the label link and Open link should be present; no review link
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links.every(l => l.getAttribute('href') === 'https://example.com/ref/abc')).toBe(true)
  })

  it('renders review link with rating when review_post_id is set with slug', () => {
    render(
      <ReferralLinkCard
        link={makeLink({
          review_post_id: 'post-abc',
          review_post_slug: 'my-review-slug',
          review_avg_rating: 4.5,
        })}
        user={makeUser()}
      />,
    )
    const link = screen.getByRole('link', { name: /4\.5\/5 review/i })
    expect(link).toHaveAttribute('href', '/review/my-review-slug')
  })

  it('falls back to review_post_id when slug is null', () => {
    render(
      <ReferralLinkCard
        link={makeLink({
          review_post_id: 'post-xyz',
          review_post_slug: null,
          review_avg_rating: null,
        })}
      />,
    )
    const link = screen.getByRole('link', { name: /View review/i })
    expect(link).toHaveAttribute('href', '/review/post-xyz')
  })

  it('falls back to the url when label is null', () => {
    render(
      <ReferralLinkCard link={makeLink({ label: null, url: 'https://example.com/ref/abc' })} />,
    )
    // URL text should be inside an ExternalLink anchor
    const labelLink = screen.getByRole('link', { name: 'https://example.com/ref/abc' })
    expect(labelLink).toHaveAttribute('href', 'https://example.com/ref/abc')
  })

  it('renders non-clickable span for unsafe url schemes', () => {
    const unsafeUrl = `javascript:alert(1)`
    render(<ReferralLinkCard link={makeLink({ url: unsafeUrl })} />)
    // ExternalLink degrades to <span> for unsafe protocols — no links for the referral URL
    const links = screen.queryAllByRole('link')
    // Any remaining links belong to review only (none here since review_post_id is null)
    expect(links).toHaveLength(0)
    // The label text should appear but as a non-link element
    expect(screen.getByText('My Referral Link')).toBeInTheDocument()
  })

  it('renders compact variant without the Open button', () => {
    render(
      <ReferralLinkCard
        link={makeLink()}
        variant='compact'
      />,
    )
    // The label link is present
    const labelLink = screen.getByRole('link', { name: 'My Referral Link' })
    expect(labelLink).toHaveAttribute('href', 'https://example.com/ref/abc')
    // The Open button must NOT be rendered in compact mode
    expect(screen.queryByRole('link', { name: 'Open' })).toBeNull()
  })
})
