import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  makeUserReferralLink,
  makeUserReferralLinksResponse,
} from '@/test-helpers/api-responses/referral-links'
import { PaginatedUserReferralLinkList } from '../paginated-user-referral-link-list'

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

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
        [key: string]: unknown
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

describe('PaginatedUserReferralLinkList', () => {
  it('renders summary rows that open the referral program page', () => {
    const link = makeUserReferralLink({
      referral_program_name: 'Chase Sapphire',
      referral_program_slug: 'chase-sapphire',
      url: 'https://example.com/ref/chase',
    })

    render(
      <PaginatedUserReferralLinkList
        initialData={makeUserReferralLinksResponse({ links: [link] })}
        userId={link.user_id}
        emptyTitle='No referral links found.'
        emptyDescription='No referral links have been added yet.'
      />,
    )

    const summary = screen.getByRole('link', { name: /Chase Sapphire/ })
    expect(summary.getAttribute('href')).toBe('/referral-program/chase-sapphire')
    expect(summary.getAttribute('data-pw')).toBe('user-referral-link-summary')
    expect(summary.textContent).toContain('https://example.com/ref/chase')
  })
})
