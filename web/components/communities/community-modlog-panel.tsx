'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchCommunityModlog } from '@/lib/api/client'
import type { Community, ModlogResponseBody, ModeratorActionView } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  community: Community
  initialData: ModlogResponseBody
}

export function CommunityModlogPanel({ community, initialData }: Props) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(
      initialData,
      `/api/v1/communities/${community.slug}/modlog`,
      {},
      {
        loadPage: cursor => fetchCommunityModlog(community.slug, cursor),
      },
    )
  const actions = uniqueActions(
    pages.flatMap(page =>
      page.results.flatMap(result => {
        const action = page.moderator_actions[result.id]
        return action ? [action] : []
      }),
    ),
  )
  const users = Object.assign({}, ...pages.map(page => page.users)) as ModlogResponseBody['users']

  return (
    <Card>
      <CardHeader>
        <CardTitle data-pw='community-modlog-heading'>
          {t('extracted.communities.communityModlogPanel.moderatorActionLog_009b43cb')}
        </CardTitle>
        <CardDescription>
          {t(
            'extracted.communities.communityModlogPanel.auditHistoryOfModerationActionsIn_a0d24488',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {actions.length === 0 && (
          <p
            className='text-sm text-muted-foreground'
            data-pw='community-modlog-empty'
          >
            {t('extracted.communities.communityModlogPanel.noModerationActionsOnRecord_bbada885')}
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
          {actions.map(action => {
            const actor = action.actor_id ? users[action.actor_id] : null
            return (
              <div
                key={action.id}
                className='rounded-md border p-3 text-sm'
                data-pw='community-modlog-row'
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium'>
                    {actor?.username ? `@${actor.username}` : (action.actor_id ?? 'System')}
                  </span>
                  <span className='text-muted-foreground'>
                    {t('extracted.communities.communityModlogPanel.text_a137f17a')}
                  </span>
                  <span className='font-mono text-xs'>{action.action_type}</span>
                  {action.reason && (
                    <>
                      <span className='text-muted-foreground'>
                        {t('extracted.communities.communityModlogPanel.text_a137f17a')}
                      </span>
                      <span className='text-muted-foreground'>{action.reason}</span>
                    </>
                  )}
                  <span
                    className='ml-auto text-muted-foreground'
                    suppressHydrationWarning
                  >
                    {action.created_at.split('T')[0]}
                  </span>
                </div>
              </div>
            )
          })}
        </InfiniteScroll>
      </CardContent>
    </Card>
  )
}

function uniqueActions(actions: ModeratorActionView[]): ModeratorActionView[] {
  return [...new Map(actions.map(action => [action.id, action])).values()]
}
