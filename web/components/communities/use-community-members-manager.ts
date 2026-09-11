'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { banMember, removeMember, transferOwnership, updateMemberRole } from '@/lib/api/client'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type {
  Community,
  CommunityMember,
  CommunityMembersResponseBody,
} from '@/types/api-responses'

export type CommunityMemberLoading = {
  userId: string
  action: 'role' | 'remove' | 'transfer' | 'ban'
} | null

export function useCommunityMembersManager({
  community,
  currentUserMembership,
  data,
}: {
  community: Community
  currentUserMembership: CommunityMember | null | undefined
  data: CommunityMembersResponseBody
}) {
  const router = useRouter()
  const endpoint = `/api/v1/communities/${encodeURIComponent(community.slug)}/members`
  const paginated = usePaginatedList(data, endpoint, {})
  const results = mergePageResultsById(paginated.pages)
  const communityMembers = mergeRecords(paginated.pages, page => page.community_members)
  const users = mergeRecords(paginated.pages, page => page.users)
  const [loading, setLoading] = useState<CommunityMemberLoading>(null)
  const [error, setError] = useState<string | null>(null)
  const [transferDialogUserId, setTransferDialogUserId] = useState<string | null>(null)
  const [banDialogUserId, setBanDialogUserId] = useState<string | null>(null)
  // Membership rows removed/banned this session. router.refresh() only refreshes the first page, so
  // we hide them locally to keep accumulated infinite-scroll pages consistent until the next full
  // load. Keyed by membership row id (not user id) so a user who rejoins gets a new row that is not
  // suppressed.
  const [dismissedMembershipIds, setDismissedMembershipIds] = useState<ReadonlySet<string>>(
    new Set(),
  )
  const members = results.flatMap(result => {
    const member = communityMembers[result.id]
    return member && !member.removed_at && !dismissedMembershipIds.has(member.id) ? [member] : []
  })

  function dismissUser(userId: string) {
    const membershipId = members.find(member => member.user_id === userId)?.id
    if (!membershipId) return
    setDismissedMembershipIds(prev => new Set(prev).add(membershipId))
  }

  async function handleMakeModerator(userId: string) {
    await updateRole(userId, 'moderator')
  }

  async function handleRemoveModerator(userId: string) {
    await updateRole(userId, 'member')
  }

  async function updateRole(userId: string, role: 'member' | 'moderator') {
    setError(null)
    setLoading({ userId, action: 'role' })
    try {
      await updateMemberRole(community.slug, userId, role)
      router.refresh()
    } catch (error) {
      /* c8 ignore next -- error path requires injecting a role update failure */
      setError(error instanceof Error ? error.message : 'Failed to update role')
    } finally {
      setLoading(null)
    }
  }

  async function handleRemove(userId: string) {
    setError(null)
    setLoading({ userId, action: 'remove' })
    try {
      await removeMember(community.slug, userId)
      dismissUser(userId)
      router.refresh()
    } catch (error) {
      /* c8 ignore next -- error path requires injecting a remove failure */
      setError(error instanceof Error ? error.message : 'Failed to remove member')
    } finally {
      setLoading(null)
    }
  }

  async function handleBan(userId: string, opts?: { reason?: string; expiresAt?: string }) {
    setError(null)
    setLoading({ userId, action: 'ban' })
    try {
      await banMember(community.slug, userId, opts)
      setBanDialogUserId(null)
      dismissUser(userId)
      router.refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to ban member')
    } finally {
      setLoading(null)
    }
  }

  async function handleTransferOwnership(userId: string) {
    setError(null)
    setLoading({ userId, action: 'transfer' })
    try {
      await transferOwnership(community.slug, userId)
      setTransferDialogUserId(null)
      router.refresh()
    } catch (error) {
      /* c8 ignore next -- error path requires injecting a transfer failure */
      setError(error instanceof Error ? error.message : 'Failed to transfer ownership')
    } finally {
      setLoading(null)
    }
  }

  return {
    ...paginated,
    banDialogUserId,
    error,
    handleBan,
    handleLoadMore: paginated.loadMore,
    handleMakeModerator,
    handleRemove,
    handleRemoveModerator,
    handleTransferOwnership,
    isOwner: currentUserMembership?.role === 'owner',
    isModerator: currentUserMembership?.role === 'moderator',
    loading,
    members,
    setBanDialogUserId,
    setTransferDialogUserId,
    transferDialogUserId,
    users,
  }
}

export type CommunityMembersManagerState = ReturnType<typeof useCommunityMembersManager>
