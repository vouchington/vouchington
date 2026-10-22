'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  acceptHouseholdInvitation,
  createHouseholdInvitation,
  declineHouseholdInvitation,
  getHouseholdInvitationsClient,
  getMyHouseholdInvitationsClient,
  revokeHouseholdInvitation,
} from '@/lib/api/client/household-invitations'
import onError, { onSuccess } from '@/lib/on-error'
import type { HouseholdInvitation, HouseholdInvitationPage } from '@/types/household-invitations'
import type { ListResponse } from '@/types/api-responses'
import { HouseholdInvitationsView } from './household-invitations-view'

type Props = {
  initialPage: HouseholdInvitationPage
} & ({ kind: 'received' } | { kind: 'sent'; householdId: string })
const PAGE_LIMIT = 25

export function HouseholdInvitations(props: Props) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [relationship, setRelationship] = useState('')
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set())
  const [created, setCreated] = useState<{
    source: HouseholdInvitationPage
    invitations: HouseholdInvitation[]
  }>({ source: props.initialPage, invitations: [] })
  // A server refresh is authoritative, so optimistic rows apply only to the page they were added on.
  const createdInvitations = created.source === props.initialPage ? created.invitations : []
  const [formKey, setFormKey] = useState(0)
  const [retried, setRetried] = useState<{
    source: HouseholdInvitationPage
    page: ListResponse<HouseholdInvitation>
  } | null>(null)
  const retryPage = retried?.source === props.initialPage ? retried.page : null
  const householdId = props.kind === 'sent' ? props.householdId : null
  // Pagination uses the initial page's identity to distinguish a server refresh from local renders.
  const initialPage = useMemo(
    () => ({
      results: props.initialPage.invitations,
      page_info: props.initialPage.pageInfo,
    }),
    [props.initialPage],
  )
  const loadPage = (after?: string) =>
    householdId
      ? getHouseholdInvitationsClient(householdId, { after, limit: PAGE_LIMIT })
      : getMyHouseholdInvitationsClient({ after, limit: PAGE_LIMIT })
  const pagination = usePaginatedList(
    retryPage ?? initialPage,
    householdId
      ? `/api/v1/households/${encodeURIComponent(householdId)}/invitations`
      : '/api/v1/my/household-invitations',
    { limit: PAGE_LIMIT },
    { loadPage },
  )
  const invitations = new Map<string, HouseholdInvitation>()
  for (const invitation of [
    ...createdInvitations,
    ...pagination.pages.flatMap(page => page.results),
  ]) {
    if (!removedIds.has(invitation.id)) invitations.set(invitation.id, invitation)
  }

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function invite() {
    if (!householdId || !selectedUserId || inFlight.current || refreshing) return
    inFlight.current = true
    setSaving(true)
    try {
      const { invitation } = await createHouseholdInvitation(householdId, {
        user: selectedUserId,
        ...(relationship ? { relationship } : {}),
      })
      setCreated({
        source: props.initialPage,
        invitations: [invitation, ...createdInvitations.filter(item => item.id !== invitation.id)],
      })
      setSelectedUserId(null)
      setFormKey(key => key + 1)
      setRelationship('')
      onSuccess('Household invitation sent.')
      refresh()
    } catch (err) {
      onError(err, { fallback: 'The invitation could not be sent.' })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  async function resolve(invitation: HouseholdInvitation, action: 'accept' | 'decline' | 'revoke') {
    if (inFlight.current || refreshing) return
    inFlight.current = true
    setSaving(true)
    try {
      await resolveInvitation(invitation, action)
      setRemovedIds(current => new Set([...current, invitation.id]))
      onSuccess(
        action === 'accept'
          ? 'Household invitation accepted.'
          : action === 'decline'
            ? 'Household invitation declined.'
            : 'Household invitation revoked.',
      )
      refresh()
    } catch (err) {
      onError(err, { fallback: 'The invitation could not be updated.' })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  async function retry() {
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    try {
      setRetried({ source: props.initialPage, page: await loadPage() })
    } catch (err) {
      onError(err, { fallback: 'Invitations could not be loaded.' })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <HouseholdInvitationsView
      kind={props.kind}
      invitations={[...invitations.values()].toSorted((a, b) => b.id.localeCompare(a.id))}
      pending={saving || refreshing}
      loadError={props.initialPage.loadError && !retryPage}
      hasMore={pagination.hasNextPage}
      loadingMore={pagination.loadingMore}
      pageError={pagination.fetchError !== null}
      selectedUserId={selectedUserId}
      relationship={relationship}
      formKey={formKey}
      onSelectUser={id => {
        setSelectedUserId(id || null)
      }}
      onRelationshipChange={setRelationship}
      onInvite={() => {
        void invite()
      }}
      onResolve={(invitation, action) => {
        void resolve(invitation, action)
      }}
      onRetry={() => {
        void retry()
      }}
      onLoadMore={() => {
        void pagination.loadMore()
      }}
    />
  )
}

async function resolveInvitation(
  invitation: HouseholdInvitation,
  action: 'accept' | 'decline' | 'revoke',
) {
  if (action === 'accept') return acceptHouseholdInvitation(invitation.id)
  if (action === 'decline') return declineHouseholdInvitation(invitation.id)
  return revokeHouseholdInvitation(invitation.household_id, invitation.id)
}
