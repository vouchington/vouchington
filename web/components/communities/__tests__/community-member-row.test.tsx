import { configure, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CommunityMember } from '@/types/api-responses'

// Components use data-pw (not data-testid) per project conventions.
configure({ testIdAttribute: 'data-pw' })
import { makeCommunity } from '@/test-helpers/api-responses/communities'
import type { CommunityMembersManagerState } from '../use-community-members-manager'
import { CommunityMemberRow } from '../community-member-row'

function makeMember(overrides: Partial<CommunityMember> = {}): CommunityMember {
  return {
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
    ...overrides,
  }
}

function makeState(
  overrides: Partial<CommunityMembersManagerState> = {},
): CommunityMembersManagerState {
  return {
    users: { 'u-2': { id: 'u-2', username: 'someone' } },
    loading: null,
    isModerator: false,
    banDialogUserId: null,
    setBanDialogUserId: vi.fn<(id: string | null) => void>(),
    transferDialogUserId: null,
    setTransferDialogUserId: vi.fn<(id: string | null) => void>(),
    handleBan: vi.fn<(userId: string) => Promise<void>>(() => Promise.resolve()),
    handleRemove: vi.fn<(userId: string) => Promise<void>>(() => Promise.resolve()),
    handleMakeModerator: vi.fn<(userId: string) => Promise<void>>(() => Promise.resolve()),
    handleRemoveModerator: vi.fn<(userId: string) => Promise<void>>(() => Promise.resolve()),
    handleTransferOwnership: vi.fn<(userId: string) => Promise<void>>(() => Promise.resolve()),
    ...overrides,
  } as unknown as CommunityMembersManagerState
}

describe('CommunityMemberRow', () => {
  it('shows a Ban button when the viewer is the owner acting on a member', () => {
    render(
      <CommunityMemberRow
        community={makeCommunity()}
        currentUserMembership={makeMember({ user_id: 'owner', role: 'owner' })}
        isOwner
        member={makeMember()}
        state={makeState()}
      />,
    )
    expect(screen.getByTestId('community-ban-button')).toBeInTheDocument()
  })

  it('shows a Ban button when a moderator acts on a regular member', () => {
    render(
      <CommunityMemberRow
        community={makeCommunity()}
        currentUserMembership={makeMember({ user_id: 'mod', role: 'moderator' })}
        isOwner={false}
        member={makeMember()}
        state={makeState({ isModerator: true })}
      />,
    )
    expect(screen.getByTestId('community-ban-button')).toBeInTheDocument()
  })

  it('does not show a Ban button for a moderator acting on another moderator', () => {
    render(
      <CommunityMemberRow
        community={makeCommunity()}
        currentUserMembership={makeMember({ user_id: 'mod', role: 'moderator' })}
        isOwner={false}
        member={makeMember({ role: 'moderator' })}
        state={makeState({ isModerator: true })}
      />,
    )
    expect(screen.queryByTestId('community-ban-button')).not.toBeInTheDocument()
  })

  it('does not show a Ban button for the current user themselves', () => {
    render(
      <CommunityMemberRow
        community={makeCommunity()}
        currentUserMembership={makeMember({ user_id: 'u-2', role: 'owner' })}
        isOwner
        member={makeMember({ user_id: 'u-2' })}
        state={makeState()}
      />,
    )
    expect(screen.queryByTestId('community-ban-button')).not.toBeInTheDocument()
  })
})
