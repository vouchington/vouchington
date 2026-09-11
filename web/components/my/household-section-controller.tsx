'use client'

import { useMemo, useRef, useState } from 'react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { HouseholdSectionView } from './household-section'
import type { HouseholdMembership, HouseholdSection } from '@/types/my'
import { getHouseholdMembershipsClient, removeHouseholdMembership } from '@/lib/api/client'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import type { ListResponse } from '@/types/api-responses'
import onError, { onSuccess } from '@/lib/on-error'

interface Props {
  initialSection: HouseholdSection
  sharedCount: number
  sharedIndex: number
}

const MEMBERSHIP_PAGE_LIMIT = 25

export function HouseholdSectionController({ initialSection, sharedCount, sharedIndex }: Props) {
  const [refreshedInitialPage, setRefreshedInitialPage] =
    useState<ListResponse<HouseholdMembership> | null>(null)
  const initialPage = useMemo(
    () =>
      refreshedInitialPage ?? {
        results: initialSection.memberships,
        page_info: initialSection.membershipPageInfo,
      },
    [refreshedInitialPage, initialSection.memberships, initialSection.membershipPageInfo],
  )
  const [refreshedLoadError, setRefreshedLoadError] = useState<boolean | null>(null)
  const initialLoadError = refreshedLoadError ?? initialSection.membershipLoadError
  const [retryingInitial, setRetryingInitial] = useState(false)
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set())
  const [restoredMemberships, setRestoredMemberships] = useState<
    ReadonlyMap<string, HouseholdMembership>
  >(new Map())
  const removedIdsRef = useRef(new Set<string>())
  const removeInFlight = useRef(new Set<string>())
  const initialRetryVersion = useRef(0)
  const householdId = initialSection.household.id
  const pagination = usePaginatedList(
    initialPage,
    `/api/v1/households/${encodeURIComponent(householdId)}/memberships`,
    { limit: MEMBERSHIP_PAGE_LIMIT },
    {
      loadPage: after =>
        getHouseholdMembershipsClient(householdId, { after, limit: MEMBERSHIP_PAGE_LIMIT }),
    },
  )
  const paginatedMemberships = pagination.pages.reduce<HouseholdMembership[]>(
    (members, page) =>
      members.concat(page.results.filter(membership => !removedIds.has(membership.id))),
    [],
  )
  const membershipRanks = new Map<string, number>()
  for (const page of pagination.pages) {
    for (const membership of page.results) {
      if (!membershipRanks.has(membership.id))
        membershipRanks.set(membership.id, membershipRanks.size)
    }
  }
  const memberships = paginatedMemberships.map(
    membership => restoredMemberships.get(membership.id) ?? membership,
  )
  for (const [membershipId, membership] of restoredMemberships) {
    if (!memberships.some(candidate => candidate.id === membershipId)) memberships.push(membership)
  }
  memberships.sort(
    (left, right) =>
      (membershipRanks.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (membershipRanks.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  )
  const section = { ...initialSection, memberships, membershipLoadError: initialLoadError }

  async function retryInitialPage() {
    const requestVersion = ++initialRetryVersion.current
    setRetryingInitial(true)
    try {
      const page = await getHouseholdMembershipsClient(householdId, {
        limit: MEMBERSHIP_PAGE_LIMIT,
      })
      if (initialRetryVersion.current !== requestVersion) return
      setRefreshedInitialPage({
        ...page,
        results: page.results.filter(membership => !removedIdsRef.current.has(membership.id)),
      })
      setRefreshedLoadError(false)
    } catch (error) {
      if (initialRetryVersion.current !== requestVersion) return
      onError(error, { fallback: 'Failed to load household members', extra: { householdId } })
    } finally {
      if (initialRetryVersion.current === requestVersion) setRetryingInitial(false)
    }
  }

  const handleLoadMore = pagination.loadMore

  async function removeMembership(membership: HouseholdMembership) {
    const requestKey = `${householdId}:${membership.id}`
    if (removeInFlight.current.has(requestKey)) return
    removeInFlight.current.add(requestKey)
    setRestoredMemberships(current => {
      if (!current.has(membership.id)) return current
      const next = new Map(current)
      next.delete(membership.id)
      return next
    })
    removedIdsRef.current.add(membership.id)
    setRemovedIds(new Set(removedIdsRef.current))
    setConfirmingKey(null)
    try {
      await removeHouseholdMembership(householdId, membership.id)
      onSuccess('Member removed')
    } catch (error) {
      removedIdsRef.current.delete(membership.id)
      setRemovedIds(new Set(removedIdsRef.current))
      setRestoredMemberships(current => new Map(current).set(membership.id, membership))
      onError(error, {
        fallback: 'Failed to remove member',
        extra: { householdId, membershipId: membership.id },
      })
    } finally {
      removeInFlight.current.delete(requestKey)
    }
  }

  return (
    <InfiniteScroll
      hasNextPage={!initialLoadError && pagination.hasNextPage}
      endCursor={pagination.endCursor}
      onLoadMore={handleLoadMore}
      loadingMore={pagination.loadingMore}
      fetchError={pagination.fetchError}
      clearError={pagination.clearError}
      resetKey={pagination.resetKey}
    >
      <HouseholdSectionView
        section={section}
        sharedCount={sharedCount}
        sharedIndex={sharedIndex}
        retrying={retryingInitial}
        confirmingKey={confirmingKey}
        onRetry={() => {
          void retryInitialPage()
        }}
        onRequestRemove={setConfirmingKey}
        onCancelRemove={() => setConfirmingKey(null)}
        onConfirmRemove={(_candidate, membership) => {
          void removeMembership(membership)
        }}
      />
    </InfiniteScroll>
  )
}
