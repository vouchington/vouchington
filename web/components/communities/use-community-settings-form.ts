'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archiveCommunity, unarchiveCommunity, updateCommunity } from '@/lib/api/client'
import { createCommunityPathname } from '@/lib/links/entity-href'
import type {
  Community,
  CommunityListType,
  CommunityMemberRosterVisibility,
} from '@/types/api-responses'

export function useCommunitySettingsForm(community: Community, onArchived?: () => void) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [isNavigating, startNavigation] = useTransition()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [name, setName] = useState(community.name)
  const [slug, setSlug] = useState(community.slug)
  const [markdown, setMarkdown] = useState(community.markdown ?? '')
  const [visibility, setVisibility] = useState<'public' | 'private'>(community.visibility)
  const [memberRosterVisibility, setMemberRosterVisibility] =
    useState<CommunityMemberRosterVisibility>(community.member_roster_visibility)
  const [listType, setListType] = useState<'none' | CommunityListType>(
    community.list_type ?? 'none',
  )
  const [requiresPostApproval, setRequiresPostApproval] = useState(
    !!community.post_approval_required_at,
  )
  const [allowMemberInvites, setAllowMemberInvites] = useState(
    !!community.member_invites_allowed_at,
  )
  const isBusy = loading || isNavigating
  const isArchived = !!community.archived_at

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isBusy) return

    setError(null)
    setSuccess(false)
    setLoading(true)
    try {
      await updateCommunity(community.slug, {
        name,
        slug,
        markdown: markdown || undefined,
        visibility,
        member_roster_visibility: memberRosterVisibility,
        list_type: listType === 'none' ? null : listType,
        post_approval_required_at: requiresPostApproval,
        member_invites_allowed_at: allowMemberInvites,
      })
      setSuccess(true)
      if (slug !== community.slug) {
        startNavigation(() => {
          router.push(createCommunityPathname(slug, '/settings'))
        })
      } else {
        startNavigation(() => {
          router.refresh()
        })
        setLoading(false)
      }
    } catch (error) {
      /* c8 ignore next 2 -- error path requires injecting an update failure */
      setError(error instanceof Error ? error.message : 'Failed to update community')
      setLoading(false)
    }
  }

  async function handleArchive() {
    if (!confirmArchive) {
      setConfirmArchive(true)
      return
    }
    if (isBusy) return

    setLoading(true)
    try {
      if (isArchived) {
        await unarchiveCommunity(community.slug)
      } else {
        await archiveCommunity(community.slug)
      }
      startNavigation(() => {
        if (isArchived) {
          router.refresh()
          setLoading(false)
          setConfirmArchive(false)
        } else {
          onArchived?.()
          router.push('/communities')
        }
      })
    } catch (error) {
      /* c8 ignore next 2 -- error path requires injecting an archive failure */
      setError(error instanceof Error ? error.message : 'Failed to update archive state')
      setLoading(false)
    }
  }

  return {
    allowMemberInvites,
    confirmArchive,
    error,
    handleArchive,
    handleSubmit,
    isArchived,
    isBusy,
    listType,
    loading,
    markdown,
    memberRosterVisibility,
    name,
    requiresPostApproval,
    setAllowMemberInvites,
    setListType,
    setMarkdown,
    setMemberRosterVisibility,
    setName,
    setRequiresPostApproval,
    setSlug,
    setVisibility,
    slug,
    success,
    visibility,
  }
}

export type CommunitySettingsFormState = ReturnType<typeof useCommunitySettingsForm>
