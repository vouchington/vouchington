'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card } from '@/components/ui/card'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { bookmarkEntity } from '@/lib/api/client/bookmarks'
import { ApiError } from '@/lib/api/error'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { FriendRecommendationsResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import { UserListItem } from '@/components/users/user-list'

const providerLabels: Record<string, string> = {
  facebook: 'Facebook',
  x: 'X',
  github: 'GitHub',
}

export function FriendRecommendationsList({
  initialData,
}: {
  initialData: FriendRecommendationsResponseBody
}) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, '/api/v1/my/friend-recommendations', {})
  const recommendations = mergePageResultsById(pages)
  const users = mergeRecords(pages, page => page.users)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const [actionInFlight, setActionInFlight] = useState<Set<string>>(new Set())
  const actionInFlightRef = useRef(new Set<string>())

  async function handleFollow(userId: string) {
    if (actionInFlightRef.current.has(userId)) return
    actionInFlightRef.current.add(userId)
    setActionInFlight(prev => new Set([...prev, userId]))
    setFollowed(prev => new Set([...prev, userId]))
    try {
      await bookmarkEntity('user', userId, 'follow')
      toast.success(t('extracted.my.friendRecommendationsList.followedUser_efccdf67'))
    } catch (error) {
      setFollowed(prev => without(prev, userId))
      /* c8 ignore next 2 -- error path requires injecting a follow failure */
      const message =
        error instanceof ApiError
          ? error.message
          : t('extracted.my.friendRecommendationsList.failedToFollowUser_f5a7643b')
      toast.error(message)
    } finally {
      actionInFlightRef.current.delete(userId)
      setActionInFlight(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }
  }

  async function handleDismiss(userId: string) {
    if (actionInFlightRef.current.has(userId)) return
    actionInFlightRef.current.add(userId)
    setActionInFlight(prev => new Set([...prev, userId]))
    setDismissed(prev => new Set([...prev, userId]))
    try {
      await bookmarkEntity('user', userId, 'dismiss_recommendation')
    } catch (error) {
      setDismissed(prev => without(prev, userId))
      /* c8 ignore next 2 -- error path requires injecting a dismiss failure */
      const message =
        error instanceof ApiError
          ? error.message
          : t('extracted.my.friendRecommendationsList.failedToDismiss_78d9fad2')
      toast.error(message)
    } finally {
      actionInFlightRef.current.delete(userId)
      setActionInFlight(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }
  }

  const visibleRecommendations = recommendations.filter(
    recommendation => !dismissed.has(recommendation.id) && !followed.has(recommendation.id),
  )

  if (visibleRecommendations.length === 0 && !hasNextPage) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.my.friendRecommendationsList.noFriendRecommendationsAtThisTime_fb21db17')}{' '}
        <Link
          href='/my/identity#social'
          className='underline'
          data-pw='friend-recommendations-empty-identity-link'
        >
          {t('extracted.my.friendRecommendationsList.connectYourFacebookXOrGithub_e3d61a65')}
        </Link>{' '}
        {t('extracted.my.friendRecommendationsList.toFindPeopleYouKnow_793a41d7')}
      </p>
    )
  }

  return (
    <InfiniteScroll
      hasNextPage={hasNextPage}
      endCursor={endCursor}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={clearError}
      resetKey={resetKey}
    >
      <div className='space-y-4'>
        <ul className='divide-y'>
          {visibleRecommendations.map(recommendation => {
            const user = users[recommendation.id]
            const providerLabel = providerLabels[recommendation.provider] ?? recommendation.provider
            const context = t('extracted.my.friendRecommendationsList.viaProviderlabel_3c6f79cf', {
              providerLabel,
            })
            const actions = (
              <ButtonGroup>
                <Button
                  size='touchSm'
                  variant='outline'
                  onClick={() => handleFollow(recommendation.id)}
                  disabled={actionInFlight.has(recommendation.id)}
                >
                  {t('extracted.my.friendRecommendationsList.follow_641d1ef6')}
                </Button>
                <Button
                  size='touchSm'
                  variant='outline'
                  onClick={() => handleDismiss(recommendation.id)}
                  disabled={actionInFlight.has(recommendation.id)}
                >
                  {t('extracted.my.friendRecommendationsList.dismiss_48845bff')}
                </Button>
              </ButtonGroup>
            )

            return (
              <li
                key={recommendation.id}
                className='py-2'
              >
                {user ? (
                  <UserListItem
                    user={user}
                    context={context}
                    actions={actions}
                  />
                ) : (
                  <Card className='p-4'>
                    <p className='truncate font-medium'>
                      {recommendation.provider_friend_name || providerLabel}
                    </p>
                    <p className='mt-2 text-xs text-muted-foreground'>{context}</p>
                    <div className='mt-3'>{actions}</div>
                  </Card>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </InfiniteScroll>
  )
}

function without(values: Set<string>, value: string): Set<string> {
  const next = new Set(values)
  next.delete(value)
  return next
}
