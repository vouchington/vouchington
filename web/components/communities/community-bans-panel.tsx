'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { liftBan, fetchCommunityBans } from '@/lib/api/client'
import type { Community, CommunityBansResponseBody } from '@/types/api-responses'
import { isBanActive } from './community-bans-panel-state'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  community: Community
  initialData: CommunityBansResponseBody
}

export function CommunityBansPanel({ community, initialData }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(
      initialData,
      `/api/v1/communities/${community.slug}/bans`,
      {},
      {
        loadPage: cursor => fetchCommunityBans(community.slug, cursor),
      },
    )
  const [liftingUserId, setLiftingUserId] = useState<string | null>(null)
  const [liftError, setLiftError] = useState<string | null>(null)
  const [liftedAtByUserId, setLiftedAtByUserId] = useState<Record<string, string>>({})
  const users = Object.assign(
    {},
    ...pages.map(page => page.users),
  ) as CommunityBansResponseBody['users']
  const bans = uniqueBans(
    pages.flatMap(page =>
      page.results.flatMap(result => {
        const ban = page.community_bans[result.id]
        return ban ? [ban] : []
      }),
    ),
  ).map(ban => {
    const liftedAt = liftedAtByUserId[ban.user_id]
    return liftedAt ? { ...ban, lifted_at: ban.lifted_at ?? liftedAt } : ban
  })

  async function handleLiftBan(userId: string) {
    setLiftingUserId(userId)
    setLiftError(null)
    try {
      await liftBan(community.slug, userId)
      setLiftedAtByUserId(prev => ({ ...prev, [userId]: new Date().toISOString() }))
      setLiftingUserId(null)
      router.refresh()
    } catch (error) {
      setLiftingUserId(null)
      setLiftError(error instanceof Error ? error.message : 'Failed to lift ban')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-pw='community-bans-heading'>
          {t('extracted.communities.communityBansPanel.banHistory_603f2536')}
        </CardTitle>
        <CardDescription>
          {t('extracted.communities.communityBansPanel.activeAndLiftedBansForThis_9991f3fa')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {liftError && <p className='text-sm text-destructive'>{liftError}</p>}
        {bans.length === 0 && (
          <p
            className='text-sm text-muted-foreground'
            data-pw='community-bans-empty'
          >
            {t('extracted.communities.communityBansPanel.noBansOnRecord_7ee4f2c8')}
          </p>
        )}
        <InfiniteScroll
          hasNextPage={hasNextPage}
          endCursor={endCursor}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          fetchError={fetchError}
          clearError={clearError}
          resetKey={resetKey}
        >
          {bans.map(ban => {
            const user = users[ban.user_id]
            const isActive = isBanActive(ban)
            const statusLabel = isActive ? 'Active' : ban.lifted_at ? 'Lifted' : 'Expired'
            const isLifting = liftingUserId === ban.user_id
            return (
              <div
                key={ban.id}
                className='flex items-start justify-between rounded-md border p-3 text-sm'
                data-pw='community-ban-row'
              >
                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <span className='font-medium'>
                      {user?.username ? `@${user.username}` : ban.user_id}
                    </span>
                    <Badge
                      variant={isActive ? 'destructive' : 'secondary'}
                      suppressHydrationWarning
                    >
                      {statusLabel}
                    </Badge>
                  </div>
                  {ban.reason && (
                    <p className='text-muted-foreground'>
                      {t('extracted.communities.communityBansPanel.reasonReason_ae08e67f', {
                        reason: ban.reason,
                      })}
                    </p>
                  )}
                  <p
                    className='text-muted-foreground'
                    suppressHydrationWarning
                  >
                    {ban.expires_at ? `Expires: ${ban.expires_at.split('T')[0]}` : 'Permanent'}
                  </p>
                  {ban.lifted_at && (
                    <p
                      className='text-muted-foreground'
                      suppressHydrationWarning
                    >
                      {t('extracted.communities.communityBansPanel.liftedDate_862e789c', {
                        date: ban.lifted_at.split('T')[0],
                      })}
                    </p>
                  )}
                </div>
                {isActive && (
                  <Button
                    size='sm'
                    variant='outline'
                    loading={isLifting}
                    disabled={isLifting}
                    data-pw='community-ban-lift'
                    onClick={() => handleLiftBan(ban.user_id)}
                  >
                    {isLifting ? 'Lifting…' : 'Lift ban'}
                  </Button>
                )}
              </div>
            )
          })}
        </InfiniteScroll>
      </CardContent>
    </Card>
  )
}

function uniqueBans(bans: CommunityBansResponseBody['community_bans'][string][]) {
  return [...new Map(bans.map(ban => [ban.id, ban])).values()]
}
