import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MyBansResponse } from '@/types/my'
import { MyBansClient } from './my-bans-client'

const { mockListMyBans } = vi.hoisted(() => ({ mockListMyBans: vi.fn<VitestLooseMock>() }))

vi.mock(import('@/lib/api/client/bans'), () => ({ listMyBans: mockListMyBans }))

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <time data-testid='time-ago'>{date}</time>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

const emptyData: MyBansResponse = {
  bans: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

const dataWithBan: MyBansResponse = {
  bans: [
    {
      id: 'ban-1',
      community_id: 'community-1',
      community_slug: 'credit-cards',
      user_id: 'user-1',
      reason: 'Violation of community rules.',
      expires_at: null,
      created_at: '2026-05-31T00:00:00.000Z',
      updated_at: '2026-05-31T00:00:00.000Z',
      lifted_at: null,
      __entity_type: 'community_ban',
    },
  ],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('MyBansClient', () => {
  it('shows empty state when there are no bans', () => {
    render(<MyBansClient initialData={emptyData} />)

    expect(screen.getByText('You have no active community bans.')).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders a list of bans when bans exist', () => {
    render(<MyBansClient initialData={dataWithBan} />)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('Violation of community rules.')).toBeVisible()
  })

  it('renders the appeal dialog trigger for each ban', () => {
    render(<MyBansClient initialData={dataWithBan} />)

    expect(screen.getByRole('button', { name: 'File an appeal' })).toBeInTheDocument()
  })

  it('shows community link when community_slug is set', () => {
    render(<MyBansClient initialData={dataWithBan} />)

    const link = screen.getByRole('link', { name: 'credit-cards' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/communities/credit-cards')
  })

  it('shows no-reason placeholder when reason is null', () => {
    const data: MyBansResponse = {
      bans: [{ ...dataWithBan.bans[0]!, reason: null }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    render(<MyBansClient initialData={data} />)

    expect(screen.getByText('No reason was provided.')).toBeVisible()
  })

  it('shows expiry when expires_at is set', () => {
    const data: MyBansResponse = {
      bans: [{ ...dataWithBan.bans[0]!, expires_at: '2027-01-01T00:00:00.000Z' }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    const { container } = render(<MyBansClient initialData={data} />)

    expect(container.querySelector('[data-pw="my-ban-expires"]')).not.toBeNull()
  })

  it('shows load-more button when has_next_page is true', () => {
    const data: MyBansResponse = {
      bans: [{ ...dataWithBan.bans[0]! }],
      page_info: { has_next_page: true, end_cursor: 'cursor-abc', start_cursor: null },
    }
    render(<MyBansClient initialData={data} />)
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument()
  })

  it('does not show load-more button when has_next_page is false', () => {
    render(<MyBansClient initialData={dataWithBan} />)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('loads more bans when load-more button is clicked', async () => {
    const extraBan: MyBansResponse['bans'][0] = {
      id: 'ban-2',
      community_id: 'community-2',
      community_slug: 'investing',
      user_id: 'user-1',
      reason: null,
      expires_at: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      lifted_at: null,
      __entity_type: 'community_ban',
    }
    mockListMyBans.mockResolvedValueOnce({
      bans: [{ ...dataWithBan.bans[0]!, reason: 'Updated reason.' }, extraBan],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    const data: MyBansResponse = {
      bans: [{ ...dataWithBan.bans[0]! }],
      page_info: { has_next_page: true, end_cursor: 'cursor-abc', start_cursor: null },
    }
    render(<MyBansClient initialData={data} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(mockListMyBans).toHaveBeenCalledWith('cursor-abc')
      expect(screen.getByText('No reason was provided.')).toBeInTheDocument()
    })
    expect(screen.getAllByRole('button', { name: 'File an appeal' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
})
