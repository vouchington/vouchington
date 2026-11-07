'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { liftBan, liftAllBans, fetchCommunityBan, fetchCommunityBans } from '@/lib/api/client'
import { LiftAllBansDialog } from './lift-all-bans-dialog'
import { ApiError } from '@vouchington/api-client'
import type { Community, CommunityBan, CommunityBansResponseBody } from '@/types/api-responses'
import { isBanActive, uniqueBans } from './community-bans-panel-state'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getUserLabel } from '@/lib/users/user-helpers'
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
  const [liftingId, setLiftingId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, CommunityBan>>({})
  const [liftError, setLiftError] = useState<string | null>(null)
  const [liftedAtByBanId, setLiftedAtByBanId] = useState<Record<string, string>>({})
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
    const liftedAt = liftedAtByBanId[ban.id]
    return liftedAt ? { ...ban, lifted_at: ban.lifted_at ?? liftedAt } : ban
  })
  async function handleLiftBan(id: string, all: boolean) {
    setLiftingId(id)
    setLiftError(null)
    try {
      const result = all ? await liftAllBans(community.slug, id) : await liftBan(community.slug, id)
      const liftedAt = new Date().toISOString()
      const lifted = Object.fromEntries(result.lifted_ban_ids.map(banId => [banId, liftedAt]))
      setLiftedAtByBanId(prev => ({ ...prev, ...lifted }))
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'COMMUNITY_BAN_LIFT_ALL_FORBIDDEN') {
        setLiftError(t('moderation.communityBans.liftAllForbidden'))
      } else if (err instanceof ApiError && err.code === 'COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED') {
        const cap =
          err.data && typeof err.data === 'object' && 'cap' in err.data ? err.data.cap : undefined
        setLiftError(
          typeof cap === 'number'
            ? t('moderation.communityBans.liftAllLimit', { cap })
            : t('moderation.communityBans.liftAllLimitUnknown'),
        )
      } else {
        setLiftError(err instanceof Error ? err.message : t('moderation.communityBans.liftFailed'))
      }
    } finally {
      setLiftingId(null)
    }
  }
  async function handleShowDetails(banId: string) {
    setLiftError(null)
    try {
      const { community_ban } = await fetchCommunityBan(community.slug, banId)
      setDetails(prev => ({ ...prev, [banId]: community_ban }))
    } catch (err) {
      setLiftError(
        err instanceof Error ? err.message : t('moderation.communityBans.detailLoadFailed'),
      )
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
            const isLifting = liftingId === ban.id || liftingId === ban.user_id
            return (
              <div
                key={ban.id}
                className='flex items-start justify-between rounded-md border p-3 text-sm'
                data-pw='community-ban-row'
              >
                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <span className='font-medium'>
                      {getUserLabel(user, t('shared.user.deletedUser'))}
                    </span>
                    <Badge
                      variant={isActive ? 'destructive' : 'secondary'}
                      suppressHydrationWarning
                    >
                      {statusLabel}
                    </Badge>
                  </div>
                  {details[ban.id]?.reason && (
                    <p className='text-muted-foreground'>
                      {t('extracted.communities.communityBansPanel.reasonReason_ae08e67f', {
                        reason: details[ban.id]!.reason!,
                      })}
                    </p>
                  )}
                  {!details[ban.id] && (
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => handleShowDetails(ban.id)}
                    >
                      {t('extracted.communities.applicationReview.showDetails_1af77ee2')}
                    </Button>
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
                  <div className='flex gap-2'>
                    <Button
                      size='sm'
                      disabled={liftingId !== null}
                      data-pw='community-ban-lift'
                      onClick={() => handleLiftBan(ban.id, false)}
                    >
                      {isLifting ? 'Lifting…' : 'Lift ban'}
                    </Button>
                    <LiftAllBansDialog
                      userLabel={getUserLabel(user, t('shared.user.deletedUser'))}
                      disabled={liftingId !== null}
                      onConfirm={() => handleLiftBan(ban.user_id, true)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </InfiniteScroll>
      </CardContent>
    </Card>
  )
}
