'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import { getUserLabel } from '@/lib/users/user-helpers'
import type { ModerationAnalytics } from '@/types/moderation-analytics'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatLabel } from './moderation-analytics-format'

export function ModerationAnalyticsWorkload({ metrics }: { metrics: ModerationAnalytics }) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <Card data-pw='moderation-analytics-workload'>
      <CardHeader>
        <CardTitle>
          {t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.moderatorWorkload_8d9381df',
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto'>
          <table className='min-w-full divide-y divide-border text-sm'>
            <thead>
              <tr className='text-left text-xs uppercase text-muted-foreground'>
                <th className='py-2 pr-4 font-medium'>
                  {t(
                    'extracted.moderationAnalytics.moderationAnalyticsDashboard.moderator_6748ec8b',
                  )}
                </th>
                <th className='py-2 pr-4 font-medium'>
                  {t('extracted.moderationAnalytics.moderationAnalyticsDashboard.actions_ff8059dc')}
                </th>
                <th className='py-2 pr-4 font-medium'>
                  {t(
                    'extracted.moderationAnalytics.moderationAnalyticsDashboard.topAction_4ad345ef',
                  )}
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {metrics.moderator_workload.moderators.length === 0 && (
                <tr>
                  <td
                    className='py-6 text-center text-muted-foreground'
                    colSpan={3}
                  >
                    {t(
                      'extracted.moderationAnalytics.moderationAnalyticsDashboard.noModeratorActionsInThisPeriod_a21359a6',
                    )}
                  </td>
                </tr>
              )}
              {metrics.moderator_workload.moderators.map(moderator => {
                const user = metrics.moderator_workload.users[moderator.actor_user_id]
                const topAction = Object.entries(moderator.counts).toSorted(
                  (a, b) => b[1] - a[1],
                )[0]
                return (
                  <tr key={moderator.actor_user_id}>
                    <td className='py-3 pr-4 font-medium'>
                      {getUserLabel(
                        {
                          username: user?.username,
                          display_account: { name: user?.verified_display_name },
                        },
                        t('shared.user.deletedUser'),
                      )}
                    </td>
                    <td className='py-3 pr-4'>{formatNumber(moderator.total, uiLocale)}</td>
                    <td className='py-3 pr-4 text-muted-foreground'>
                      {topAction
                        ? `${formatLabel(topAction[0])} (${formatNumber(topAction[1], uiLocale)})`
                        : t(
                            'extracted.moderationAnalytics.moderationAnalyticsDashboard.nA_a683c5c5',
                          )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
