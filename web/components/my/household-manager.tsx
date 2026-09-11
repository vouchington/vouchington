'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import { HouseholdSectionController } from './household-section-controller'
import type { Household, HouseholdSection, HouseholdSectionListItem } from '@/types/my'
import {
  createHousehold,
  getHouseholdMembershipsClient,
  getHouseholdsClient,
} from '@/lib/api/client'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import type { ListResponse, PageInfo } from '@/types/api-responses'
import onError, { onSuccess } from '@/lib/on-error'

interface Props {
  initialOwnedSection: HouseholdSection | null
  initialSharedPage: ListResponse<HouseholdSectionListItem>
  ownedProbeSucceeded: boolean
  sharedLoadError: boolean
}

const PAGE_LIMIT = 25
const TERMINAL_PAGE_INFO: PageInfo = {
  has_next_page: false,
  start_cursor: null,
  end_cursor: null,
}

async function loadMembershipSection(household: Household): Promise<HouseholdSection> {
  try {
    const page = await getHouseholdMembershipsClient(household.id, { limit: PAGE_LIMIT })
    return {
      household,
      isOwner: false,
      memberships: page.results,
      membershipPageInfo: page.page_info,
      membershipLoadError: false,
    }
  } catch {
    return {
      household,
      isOwner: false,
      memberships: [],
      membershipPageInfo: TERMINAL_PAGE_INFO,
      membershipLoadError: true,
    }
  }
}

async function loadSharedSectionPage(
  after?: string,
): Promise<ListResponse<HouseholdSectionListItem>> {
  const householdPage = await getHouseholdsClient({ access: 'member', after, limit: PAGE_LIMIT })
  const sections = await Promise.all(householdPage.results.map(loadMembershipSection))
  return {
    results: sections.map(section => ({ id: section.household.id, section })),
    page_info: householdPage.page_info,
  }
}

export function HouseholdManager({
  initialOwnedSection,
  initialSharedPage,
  ownedProbeSucceeded,
  sharedLoadError: initialSharedLoadError,
}: Props) {
  const [ownedSection, setOwnedSection] = useState(initialOwnedSection)
  const [sharedPage, setSharedPage] = useState(initialSharedPage)
  const [sharedLoadError, setSharedLoadError] = useState(initialSharedLoadError)
  const [retryingShared, setRetryingShared] = useState(false)
  const [creating, setCreating] = useState(false)
  const createInFlight = useRef(false)
  const sharedRetryVersion = useRef(0)
  const pagination = usePaginatedList(
    sharedPage,
    '/api/v1/households',
    {
      access: 'member',
      limit: PAGE_LIMIT,
    },
    { loadPage: loadSharedSectionPage },
  )
  const sharedSections = pagination.pages.flatMap(page =>
    page.results.map(result => result.section),
  )

  async function handleCreate() {
    if (createInFlight.current || ownedSection || !ownedProbeSucceeded) return
    createInFlight.current = true
    setCreating(true)
    try {
      const { household } = await createHousehold({})
      setOwnedSection({
        household,
        isOwner: true,
        memberships: [],
        membershipPageInfo: TERMINAL_PAGE_INFO,
        membershipLoadError: false,
      })
      onSuccess('Household created')
    } catch (error) {
      onError(error, { fallback: 'Failed to create household' })
    } finally {
      createInFlight.current = false
      setCreating(false)
    }
  }

  async function retrySharedFirstPage() {
    const requestVersion = ++sharedRetryVersion.current
    setRetryingShared(true)
    try {
      const page = await loadSharedSectionPage()
      if (sharedRetryVersion.current !== requestVersion) return
      setSharedPage(page)
      setSharedLoadError(false)
    } catch (error) {
      if (sharedRetryVersion.current !== requestVersion) return
      onError(error, { fallback: 'Failed to load shared households' })
    } finally {
      if (sharedRetryVersion.current === requestVersion) setRetryingShared(false)
    }
  }

  const sections = ownedSection ? [ownedSection, ...sharedSections] : sharedSections
  const handleLoadMoreShared = pagination.loadMore
  return (
    <div
      className='space-y-6'
      data-pw='household-manager'
    >
      {!ownedSection && ownedProbeSucceeded && (
        <section
          className='space-y-3'
          data-pw='household-create-section'
        >
          <p className='text-sm text-muted-foreground'>You do not have a household yet.</p>
          <Button
            onClick={() => {
              void handleCreate()
            }}
            loading={creating}
            disabled={creating}
            data-pw='household-create'
          >
            {creating ? 'Creating...' : 'Create household'}
          </Button>
        </section>
      )}
      {sections.map((section, index) => (
        <HouseholdSectionController
          key={section.household.id}
          initialSection={section}
          sharedCount={sharedSections.length}
          sharedIndex={sections.slice(0, index + 1).filter(item => !item.isOwner).length}
        />
      ))}
      {sharedLoadError ? (
        <PaginatedListFooter
          mode='retry-only'
          fetchError={new Error('Failed to load shared households')}
          canLoadMore
          loadingMore={retryingShared}
          clearError={() => undefined}
          loadMore={retrySharedFirstPage}
        />
      ) : (
        <InfiniteScroll
          hasNextPage={pagination.hasNextPage}
          endCursor={pagination.endCursor}
          onLoadMore={handleLoadMoreShared}
          loadingMore={pagination.loadingMore}
          fetchError={pagination.fetchError}
          clearError={pagination.clearError}
          resetKey={pagination.resetKey}
        >
          {null}
        </InfiniteScroll>
      )}
    </div>
  )
}
