'use client'

import { useRef, useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/shared/user-avatar'
import { fetchCommunityModeratorStats } from '@/lib/api/client/community-moderator-stats'
import onError from '@/lib/on-error'
import type {
  CommunityModeratorStatEntry,
  CommunityModeratorStatsResponseBody,
} from '@/types/api-responses'
import type { PublicUser } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

type DisplayedActionType = 'remove' | 'approve' | 'ban' | 'resolve_report'

const DISPLAYED_ACTION_TYPES: Array<{
  key: DisplayedActionType
}> = [{ key: 'remove' }, { key: 'approve' }, { key: 'ban' }, { key: 'resolve_report' }]

interface Props {
  communitySlug: string
  initialData: CommunityModeratorStatsResponseBody
}

export function CommunityModeratorStatsPanel({ communitySlug, initialData }: Props) {
  const t = useTranslations()
  const [data, setData] = useState(initialData)
  const [isPending, startTransition] = useTransition()
  const latestWindowRef = useRef<30 | 90>(initialData.window)
  const actionTypeLabels: Record<DisplayedActionType, string> = {
    remove: t('extracted.communities.communityModeratorStatsPanel.removes_c89e09be'),
    approve: t('extracted.communities.communityModeratorStatsPanel.approvals_2bfc3471'),
    ban: t('extracted.communities.communityModeratorStatsPanel.bans_4d5469c7'),
    resolve_report: t('extracted.communities.communityModeratorStatsPanel.reports_dacca3cb'),
  }

  function handleWindowChange(window: 30 | 90) {
    if (data.window === window || isPending) return
    latestWindowRef.current = window
    startTransition(async () => {
      try {
        const result = await fetchCommunityModeratorStats(communitySlug, window)
        if (latestWindowRef.current === window) setData(result)
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.communities.communityModeratorStatsPanel.couldNotLoadModeratorStats_0247a677',
          ),
          tags: { panel: 'moderator-stats' },
        })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle
              data-pw='community-moderator-stats-heading'
              id='community-moderator-stats-heading'
            >
              {t(
                'extracted.communities.communityModeratorStatsPanel.moderatorContributions_2cd9c429',
              )}
            </CardTitle>
            <CardDescription>
              {t(
                'extracted.communities.communityModeratorStatsPanel.actionCountsPerModeratorOverThe_5a1bf0dc',
              )}
            </CardDescription>
          </div>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant={data.window === 30 ? 'default' : 'outline'}
              size='sm'
              disabled={isPending}
              onClick={() => handleWindowChange(30)}
              data-pw='moderator-stats-window-30'
            >
              {t('extracted.communities.communityModeratorStatsPanel.30Days_ffd72805')}
            </Button>
            <Button
              type='button'
              variant={data.window === 90 ? 'default' : 'outline'}
              size='sm'
              disabled={isPending}
              onClick={() => handleWindowChange(90)}
              data-pw='moderator-stats-window-90'
            >
              {t('extracted.communities.communityModeratorStatsPanel.90Days_38825b0f')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.stats.length === 0 ? (
          <p
            className='text-sm text-muted-foreground'
            data-pw='moderator-stats-empty'
          >
            {t(
              'extracted.communities.communityModeratorStatsPanel.noModerationActionsRecordedInThis_79859e34',
            )}
          </p>
        ) : (
          <section
            aria-labelledby='community-moderator-stats-heading'
            className='overflow-x-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring'
            data-pw='moderator-stats-table'
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG 2.1.1 requires keyboard access to the scrollable region itself.
            tabIndex={0}
          >
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b text-left text-muted-foreground'>
                  <th className='pb-2 pr-4 font-medium'>
                    {t('extracted.communities.communityModeratorStatsPanel.moderator_6748ec8b')}
                  </th>
                  {DISPLAYED_ACTION_TYPES.map(({ key }) => (
                    <th
                      key={key}
                      className='pb-2 pr-4 text-right font-medium'
                    >
                      {actionTypeLabels[key]}
                    </th>
                  ))}
                  <th className='pb-2 pr-4 text-right font-medium'>
                    {t('extracted.communities.communityModeratorStatsPanel.other_f97e9da0')}
                  </th>
                  <th className='pb-2 text-right font-medium'>
                    {t('extracted.communities.communityModeratorStatsPanel.total_c9b3c382')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.stats.map(stat => (
                  <ModeratorStatsRow
                    key={stat.actor_id}
                    stat={stat}
                    user={data.users[stat.actor_id] as PublicUser | undefined}
                  />
                ))}
              </tbody>
            </table>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

interface RowProps {
  stat: CommunityModeratorStatEntry
  user: PublicUser | undefined
}

function ModeratorStatsRow({ stat, user }: RowProps) {
  const username = user?.username ?? stat.actor_id.slice(0, 8)
  const displayedSum = DISPLAYED_ACTION_TYPES.reduce(
    (sum, { key }) => sum + (stat.counts[key] ?? 0),
    0,
  )
  const otherCount = stat.total - displayedSum
  return (
    <tr
      className='border-b last:border-0'
      data-pw='moderator-stats-row'
    >
      <td className='py-2 pr-4'>
        <div className='flex items-center gap-2'>
          <UserAvatar
            profileImageId={user?.profile_image_id}
            profileImagePlacement={user?.profile_image_placement}
            username={username}
            size='sm'
          />
          <span className='font-medium'>{username}</span>
        </div>
      </td>
      {DISPLAYED_ACTION_TYPES.map(({ key }) => (
        <td
          key={key}
          className='py-2 pr-4 text-right tabular-nums'
        >
          {stat.counts[key] ?? 0}
        </td>
      ))}
      <td className='py-2 pr-4 text-right tabular-nums'>{otherCount}</td>
      <td className='py-2 text-right font-medium tabular-nums'>{stat.total}</td>
    </tr>
  )
}
