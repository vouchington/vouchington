import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: mockRequireAdmin }))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

import CrmLayout from '../(crm)/layout'
import CuratedAsidesLayout from '../(curated-asides)/curated-asides/layout'
import MembershipsLayout from '../(memberships)/memberships/grants/layout'
import ReviewQueueLayout from '../(posts)/posts/review-queue/layout'
import RssFeedCategoriesLayout from '../(rss-feed-categories)/layout'
import SupportLayout from '../(support-admin)/layout'
import VoteIntegrityLayout from '../(vote-integrity)/layout'

const layouts = [
  ['crm', CrmLayout],
  ['curated-asides', CuratedAsidesLayout],
  ['memberships', MembershipsLayout],
  ['review-queue', ReviewQueueLayout],
  ['rss-feed-categories', RssFeedCategoriesLayout],
  ['support', SupportLayout],
  ['vote-integrity', VoteIntegrityLayout],
] as const

describe('admin resource layouts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue({ id: 'admin', roles: ['administrator'] })
  })

  it.each(layouts)('%s requires admin and renders children', async (_name, Layout) => {
    render(await Layout({ children: <span data-testid='child' /> }))

    expect(mockRequireAdmin).toHaveBeenCalled()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('propagates requireAdmin redirects', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(CrmLayout({ children: <span /> })).rejects.toThrow('NEXT_REDIRECT')
  })
})
