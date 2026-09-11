import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InviteItem } from '../invite-item'
import type { CommunityInvite } from '@/types/api-responses/pagination-and-entities'

function makeInvite(overrides: Partial<CommunityInvite>): CommunityInvite {
  return {
    id: 'invite-1',
    code: 'abc123',
    community_id: 'community-1',
    created_at: '2026-05-24T00:00:00.000Z',
    created_by_id: 'user-1',
    invited_email: 'tests+a@voucha.ai',
    invited_user_id: null,
    accepted_at: null,
    declined_at: null,
    revoked_at: null,
    ...overrides,
  } as CommunityInvite
}

describe('InviteItem', () => {
  it('renders pending invites with a revoke action', () => {
    const onRevoke = vi.fn<(inviteId: string) => void>()
    render(
      <InviteItem
        invite={makeInvite({})}
        loading={false}
        onRevoke={onRevoke}
      />,
    )

    expect(screen.getByText('Pending')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(onRevoke).toHaveBeenCalledWith('invite-1')
  })

  it.each([
    ['Revoked', { revoked_at: '2026-05-24T00:00:00.000Z' }],
    ['Accepted', { accepted_at: '2026-05-24T00:00:00.000Z' }],
    ['Declined', { declined_at: '2026-05-24T00:00:00.000Z' }],
  ])('renders %s status without revoke action', (label, overrides) => {
    render(
      <InviteItem
        invite={makeInvite(overrides)}
        loading={false}
        onRevoke={vi.fn<(inviteId: string) => void>()}
      />,
    )

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
  })
})
