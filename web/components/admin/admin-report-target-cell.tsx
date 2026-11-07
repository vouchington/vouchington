'use client'

import Link from 'next/link'
import { ExternalLinkIcon, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ReportTargetContent } from '@/components/moderation/report-target-content'
import { ReportCountBadge } from '@/components/moderation/moderation-queue-badges'
import { getUserLabel } from '@/lib/users/user-helpers'
import { communityHref, createUserPathname } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { AdminModerationReport } from './reports-client-types'

export function AdminReportTargetCell({
  report,
  targetLabel,
  targetLabelFor,
}: {
  report: AdminModerationReport
  targetLabel: string
  targetLabelFor: (label: string) => string
}) {
  const t = useTranslations()
  const deletedUserLabel = t('shared.user.deletedUser')
  const sourceLabel = report.community_ban_evasion
    ? getUserLabel(
        {
          username: report.community_ban_evasion.source_username,
          display_account: { name: report.community_ban_evasion.source_display_name },
        },
        deletedUserLabel,
      )
    : null

  return (
    <td className='px-6 py-4 text-sm'>
      <div className='flex flex-col gap-1'>
        <span className='text-xs uppercase text-muted-foreground'>
          {targetLabelFor(report.entity_type)}
        </span>
        {report.target_path ? (
          <Link
            href={report.target_path}
            className='font-medium underline'
            prefetch={false}
          >
            <ReportTargetContent
              fallback={targetLabel}
              targetContent={report.target_content}
            />
          </Link>
        ) : (
          <span>
            <ReportTargetContent
              fallback={targetLabel}
              targetContent={report.target_content}
            />
          </span>
        )}
        {report.admin_action_path && report.admin_action_path !== report.target_path ? (
          <Link
            href={report.admin_action_path}
            className='inline-flex items-center gap-1 text-xs underline'
            prefetch={false}
          >
            {t('extracted.admin.adminReportRow.moderationSurface_452781a6')}
            <ExternalLinkIcon className='size-3' />
          </Link>
        ) : null}
        <ReportCountBadge count={report.report_count} />
        {report.community_ban_evasion ? (
          <Popover>
            <PopoverTrigger
              className='inline-flex cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              aria-label={t('extracted.admin.adminReportRow.viewBanEvasionFlagDetails_a639ac11')}
            >
              <Badge
                asChild
                data-pw='ban-evasion-badge'
                variant='destructive'
              >
                <span className='inline-flex items-center gap-1'>
                  <ShieldAlert className='size-3' />
                  {t('extracted.admin.adminReportRow.banEvasion_9ce38440')}
                </span>
              </Badge>
            </PopoverTrigger>
            <PopoverContent
              data-pw='ban-evasion-detail'
              className='w-72 space-y-2 text-sm'
            >
              <p className='font-medium'>
                {t('extracted.admin.adminReportRow.suspectedBanEvasion_c9e82beb')}
              </p>
              <p className='text-muted-foreground'>
                {t('extracted.admin.adminReportRow.community_a497fe96')}{' '}
                <Link
                  href={communityHref({ slug: report.community_ban_evasion.community_slug })}
                  className='underline'
                  prefetch={false}
                >
                  {report.community_ban_evasion.community_slug}
                </Link>
              </p>
              <p className='text-muted-foreground'>
                {t('extracted.admin.adminReportRow.sourceUser_c72c579b')}{' '}
                {report.community_ban_evasion.source_username ? (
                  <Link
                    href={createUserPathname(report.community_ban_evasion.source_username)}
                    className='underline'
                    prefetch={false}
                  >
                    {sourceLabel}
                  </Link>
                ) : report.community_ban_evasion.source_user_id ? (
                  <span className='text-xs'>{sourceLabel}</span>
                ) : (
                  <span className='text-muted-foreground'>
                    {t(
                      'extracted.identityVerification.verifiedDisplayPreferencesCard.hidden_7e6fefff',
                    )}
                  </span>
                )}
              </p>
              {typeof report.community_ban_evasion.score === 'number' ? (
                <p className='text-muted-foreground'>
                  {t('extracted.admin.adminReportRow.scoreScore_fa6f0c78', {
                    score: `${(report.community_ban_evasion.score * 100).toFixed(0)}%`,
                  })}
                </p>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </td>
  )
}
