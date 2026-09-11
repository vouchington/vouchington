import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopReferralPrograms } from '../top-referral-programs'
import { makeTopicsSearchResponse, makeTopic } from '@/test-helpers/api-responses'
import { projectTopReferralPrograms } from '@/lib/view-models/homepage-view-models'

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
        children: ReactNode
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

vi.mock(
  import('@/lib/links/entity-href'),
  () =>
    ({
      topicHref: (topic: { slug: string }, tab?: string) =>
        tab ? `/referral-programs/${topic.slug}/${tab}` : `/referral-programs/${topic.slug}`,
    }) as unknown as typeof import('@/lib/links/entity-href'),
)

describe('TopReferralPrograms', () => {
  it('renders error fallback when data is null', () => {
    render(<TopReferralPrograms data={null} />)

    expect(screen.getByText('Unable to load referral programs.')).toBeDefined()
  })

  it('renders empty fallback when results are empty', () => {
    const data = makeTopicsSearchResponse({ topics: [] })

    render(<TopReferralPrograms data={projectTopReferralPrograms(data)} />)

    expect(screen.getByText('No referral programs yet.')).toBeDefined()
  })

  it('renders referral program links with names', () => {
    const topic = makeTopic({ name: 'Chase Sapphire', slug: 'chase-sapphire' })
    const data = makeTopicsSearchResponse({ topics: [topic] })

    render(<TopReferralPrograms data={projectTopReferralPrograms(data)} />)

    const link = screen.getByRole('link', { name: 'Chase Sapphire' })
    expect(link.getAttribute('href')).toBe('/referral-programs/chase-sapphire/referral-links')
    expect(screen.getByRole('link', { name: 'Browse all referral programs →' })).toBeDefined()
  })
})
