'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import { UserAvatar } from '@/components/shared/user-avatar'
import { fetchFollowerUsers } from '@/lib/api/client/users'
import { cn } from '@/lib/utils'
import type { UsersListResponseBody } from '@/types/api-responses'
import type { PublicUser } from '@/types/user'
import { FollowerSendSelectedBadges } from './follower-send-selected-badges'
import { useTranslations } from '@/lib/i18n/use-translations'

const FOLLOWER_SEARCH_LIMIT = 5

interface FollowerSendPickerProps {
  currentUserId: string
  selectedFollowers: PublicUser[]
  onToggleFollowerSelection: (follower: PublicUser) => void
}

export function FollowerSendPicker({
  currentUserId,
  selectedFollowers,
  onToggleFollowerSelection,
}: FollowerSendPickerProps) {
  const t = useTranslations()
  const [followers, setFollowers] = useState<PublicUser[]>([])
  const [pageInfo, setPageInfo] = useState<UsersListResponseBody['page_info'] | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<Error | null>(null)
  const requestGenerationRef = useRef(0)
  const queryRef = useRef('')
  const pageAbortControllerRef = useRef<AbortController | null>(null)
  const fallbackUserLabel = t('extracted.shared.followerSendPicker.user_b512d97e')
  const selectedFollowerIds = new Set(selectedFollowers.map(follower => follower.id))

  useEffect(
    () => () => {
      requestGenerationRef.current += 1
      pageAbortControllerRef.current?.abort()
    },
    [],
  )

  function resetForQuery(query: string) {
    requestGenerationRef.current += 1
    queryRef.current = query.trim()
    pageAbortControllerRef.current?.abort()
    setFollowers([])
    setPageInfo(null)
    setIsLoadingMore(false)
    setLoadMoreError(null)
  }

  async function searchFollowers(query: string, signal: AbortSignal) {
    resetForQuery(query)
    const requestGeneration = requestGenerationRef.current
    const normalizedQuery = queryRef.current
    const response = await fetchFollowerUsers(currentUserId, {
      q: normalizedQuery || undefined,
      limit: FOLLOWER_SEARCH_LIMIT,
      signal,
    })

    if (signal.aborted || requestGeneration !== requestGenerationRef.current) return []

    setFollowers(response.results)
    setPageInfo(response.page_info)
    return response.results
  }

  async function loadMoreFollowers() {
    if (isLoadingMore || !pageInfo?.has_next_page || !pageInfo.end_cursor) return

    const requestGeneration = requestGenerationRef.current
    const query = queryRef.current
    const controller = new AbortController()
    pageAbortControllerRef.current = controller
    setIsLoadingMore(true)
    setLoadMoreError(null)

    try {
      const response = await fetchFollowerUsers(currentUserId, {
        after: pageInfo.end_cursor,
        q: query || undefined,
        limit: FOLLOWER_SEARCH_LIMIT,
        signal: controller.signal,
      })
      if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return

      setFollowers(currentFollowers => {
        const knownIds = new Set(currentFollowers.map(follower => follower.id))
        return [
          ...currentFollowers,
          ...response.results.filter(follower => !knownIds.has(follower.id)),
        ]
      })
      setPageInfo(response.page_info)
    } catch (error) {
      if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) {
        setLoadMoreError(error instanceof Error ? error : new Error('Unable to load followers'))
      }
    } finally {
      if (requestGeneration === requestGenerationRef.current) setIsLoadingMore(false)
    }
  }

  const canLoadMore = pageInfo?.has_next_page === true && pageInfo.end_cursor !== null

  return (
    <div className='space-y-3'>
      <EntityAutocomplete<PublicUser>
        search={searchFollowers}
        results={followers}
        footer={
          canLoadMore ? (
            <PaginatedListFooter
              fetchError={loadMoreError}
              canLoadMore={canLoadMore}
              loadingMore={isLoadingMore}
              clearError={() => setLoadMoreError(null)}
              loadMore={loadMoreFollowers}
            />
          ) : null
        }
        getKey={follower => follower.id}
        renderItem={follower => (
          <div className='flex items-center gap-2'>
            <Check
              className={cn(
                'h-4 w-4',
                selectedFollowerIds.has(follower.id) ? 'opacity-100' : 'opacity-0',
              )}
            />
            <UserAvatar
              profileImageId={follower.profile_image_id}
              profileImagePlacement={follower.profile_image_placement}
              username={follower.username ?? follower.display_account?.name ?? fallbackUserLabel}
              size='sm'
            />
            <div className='min-w-0'>
              <div className='truncate text-sm font-medium'>
                {follower.display_account?.name ?? follower.username ?? fallbackUserLabel}
              </div>
              {follower.username ? (
                <div className='truncate text-xs text-muted-foreground'>@{follower.username}</div>
              ) : null}
            </div>
          </div>
        )}
        onSelect={follower => onToggleFollowerSelection(follower)}
        onQueryChange={resetForQuery}
        minQueryLength={0}
        closeOnSelect={false}
        placeholder={t('extracted.shared.followerSendPicker.filterFollowers_ebe0f18a')}
        ariaLabel={t('extracted.shared.followerSendPicker.chooseFollowers_b5cefa96')}
        emptyText={t('extracted.shared.followerSendPicker.noFollowersFound_1f13985f')}
      />

      {selectedFollowers.length > 0 ? (
        <FollowerSendSelectedBadges
          followers={selectedFollowers}
          onToggleFollowerSelection={onToggleFollowerSelection}
        />
      ) : null}
    </div>
  )
}
