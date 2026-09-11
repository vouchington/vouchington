import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityMember } from '@/types/api-responses'
import { makeCommunity } from '@/test-helpers/api-responses/communities'
import type { CommunityMembersManagerState } from '../use-community-members-manager'
import { TransferOwnershipDialog } from '../community-transfer-ownership-dialog'

const member: CommunityMember = {
  __entity_type: 'community_member',
  id: 'm-1',
  community_id: 'community-1',
  user_id: 'u-2',
  role: 'moderator',
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
    transferDialogUserId: member.user_id,
    setTransferDialogUserId: vi.fn<(id: string | null) => void>(),
    handleTransferOwnership: vi.fn<(userId: string) => Promise<void>>(() => Promise.resolve()),
    loading: null,
    ...overrides,
  } as unknown as CommunityMembersManagerState
}

describe('TransferOwnershipDialog', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('confirms a transfer', async () => {
    const handleTransferOwnership = vi.fn<(userId: string) => Promise<void>>(() =>
      Promise.resolve(),
    )
    render(
      <TransferOwnershipDialog
        community={makeCommunity()}
        member={member}
        state={makeState({ handleTransferOwnership })}
        username='moduser'
      />,
    )

    // Both the trigger and the confirm action share the label; the confirm action is last.
    const buttons = screen.getAllByRole('button', { name: 'Transfer Ownership' })
    fireEvent.click(buttons.at(-1)!)

    await waitFor(() => expect(handleTransferOwnership).toHaveBeenCalledWith('u-2'))
  })
})
