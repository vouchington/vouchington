'use client'

import Link from 'next/link'
import { TimeAgo } from '@/components/shared/time-ago'
import { ReportTargetContent } from '@/components/moderation/report-target-content'
import {
  ModerationSlaBadge,
  ReportCountBadge,
} from '@/components/moderation/moderation-queue-badges'
import type { MemberModerationReport } from '@/lib/api/client/reports'

interface MemberReportRowProps {
  report: MemberModerationReport
}

export function MemberReportRow({ report }: MemberReportRowProps) {
  return (
    <tr data-pw='member-report-row'>
      <td className='whitespace-nowrap px-6 py-4 text-sm tabular-nums'>
        <div className='flex flex-col items-start gap-2'>
          <TimeAgo date={report.created_at} />
          <ModerationSlaBadge createdAt={report.created_at} />
        </div>
      </td>
      <td className='px-6 py-4 text-sm'>
        <div className='flex flex-col gap-1'>
          <span className='text-xs uppercase text-muted-foreground'>{report.entity_type}</span>
          {report.target_path ? (
            <Link
              href={report.target_path}
              className='font-medium underline'
              prefetch={false}
            >
              <ReportTargetContent
                fallback={report.target_label ?? report.entity_id}
                targetContent={report.target_content}
              />
            </Link>
          ) : (
            <span>
              <ReportTargetContent
                fallback={report.target_label ?? report.entity_id}
                targetContent={report.target_content}
              />
            </span>
          )}
          <ReportCountBadge count={report.report_count} />
        </div>
      </td>
      <td
        className='px-6 py-4 text-sm'
        data-pw='report-reason'
      >
        {report.reason}
      </td>
      <td className='px-6 py-4 text-sm'>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {report.status}
        </span>
      </td>
    </tr>
  )
}
