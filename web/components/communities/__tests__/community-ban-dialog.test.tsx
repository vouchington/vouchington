import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityMember } from '@/types/api-responses'

// Components use data-pw (not data-testid) per project conventions.
configure({ testIdAttribute: 'data-pw' })
import { makeCommunity } from '@/test-helpers/api-responses/communities'
import type { CommunityMembersManagerState } from '../use-community-members-manager'
import { BanDialog } from '../community-ban-dialog'

const member: CommunityMember = {
  __entity_type: 'community_member',
  id: 'm-1',
  community_id: 'community-1',
  user_id: 'u-2',
  role: 'member',
  approved_by_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  removed_at: null,
  removed_by_id: null,
}

function makeState(
  overrides: Partial<CommunityMembersManagerState> = {},
): CommunityMembersManagerState {
  return {
    banDialogUserId: member.user_id,
    setBanDialogUserId: vi.fn<(id: string | null) => void>(),
    handleBan: vi.fn<
      (userId: string, opts?: { reason?: string; expiresAt?: string }) => Promise<void>
    >(() => Promise.resolve()),
    loading: null,
    ...overrides,
  } as unknown as CommunityMembersManagerState
}

describe('BanDialog', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('submits a permanent ban with a reason (no expiry)', async () => {
    const handleBan = vi.fn<
      (userId: string, opts?: { reason?: string; expiresAt?: string }) => Promise<void>
    >(() => Promise.resolve())
    render(
      <BanDialog
        banLoading={false}
        community={makeCommunity()}
        member={member}
        state={makeState({ handleBan })}
        username='spammer'
      />,
    )

    fireEvent.change(screen.getByTestId('community-ban-reason'), { target: { value: 'spamming' } })
    fireEvent.click(screen.getByTestId('community-ban-confirm'))

    await waitFor(() =>
      expect(handleBan).toHaveBeenCalledWith('u-2', { reason: 'spamming', expiresAt: undefined }),
    )
  })

  it('shows a loading label while banning', () => {
    render(
      <BanDialog
        banLoading
        community={makeCommunity()}
        member={member}
        state={makeState()}
        username='spammer'
      />,
    )
    expect(screen.getByText('Banning…')).toBeInTheDocument()
  })
})
