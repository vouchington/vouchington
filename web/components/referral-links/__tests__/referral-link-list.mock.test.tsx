import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ReferralLinkList } from '../referral-link-list'
import type { PrioritizedReferralLink } from '@/types/api-responses'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

const t = ((key: string) => key) as unknown as Parameters<typeof ReferralLinkList>[0]['t']

function link(id: string, priority_group: number): PrioritizedReferralLink {
  return {
    id,
    user_id: null,
    is_official: priority_group === 5,
    referral_program_id: 'rp-1',
    url: `https://example.com/${id}`,
    label: id,
    priority_group,
    contribution_rank: 0,
    tier_rank: 0,
    best_score: 0,
    review_post_id: null,
    review_post_slug: null,
    review_avg_rating: null,
  }
}

describe('ReferralLinkList', () => {
  it('renders sections as mutual follows, official links, then everyone else', () => {
    render(
      <ReferralLinkList
        t={t}
        response={{ links: [link('e', 6), link('o', 5), link('m', 1)], users: {} }}
      />,
    )

    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual([
      'extracted.referralLinks.referralLinkList.mutualFollows_d9732bd5',
      'extracted.referralLinks.referralLinkList.useOurOfficialLinks_1626a49d',
      'extracted.referralLinks.referralLinkList.everyoneElse_919112f4',
    ])
  })
})
