'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildReportsPageHref } from './reports-clustered-format'
import type { ModerationReportSortParam } from '@/lib/api/client/reports'

type ReportsNavigationProps = {
  viewerTier: 'staff' | 'member'
  sortOrder?: ModerationReportSortParam
}

export function ReportsSortSelect({ viewerTier, sortOrder }: ReportsNavigationProps) {
  const t = useTranslations()
  const router = useRouter()

  return (
    <Select
      value={sortOrder ?? (viewerTier === 'staff' ? 'severity' : 'created_at_desc')}
      onValueChange={value => {
        const params = new URL(window.location.href).searchParams
        params.set('sort', value)
        params.delete('after')
        params.delete('before')
        router.push(`/reports?${params.toString()}`, { scroll: false })
      }}
    >
      <SelectTrigger
        aria-label={t('extracted.admin.reportsClient.sortReports_87711bde')}
        className='h-11 w-44 sm:h-9'
        data-pw='reports-sort-trigger'
      >
        <SelectValue placeholder={t('extracted.admin.reportsClient.sortReports_87711bde')} />
      </SelectTrigger>
      <SelectContent>
        {viewerTier === 'staff' ? <StaffSortItems /> : <MemberSortItems />}
      </SelectContent>
    </Select>
  )
}

type ReportsPaginationProps = {
  pageInfo: {
    has_previous_page?: boolean
    has_next_page: boolean
    start_cursor?: string | null
    end_cursor?: string | null
  }
  currentAfter?: string
  statusFilter?: string
  sortOrder?: ModerationReportSortParam
  clusterMode?: 'entity' | 'none'
}

export function ReportsPagination({
  pageInfo,
  currentAfter,
  statusFilter,
  sortOrder,
  clusterMode,
}: ReportsPaginationProps) {
  const t = useTranslations()

  return (
    <div className='flex gap-4'>
      {(pageInfo.has_previous_page ?? Boolean(currentAfter)) && pageInfo.start_cursor ? (
        <Link
          href={buildReportsPageHref({
            before: pageInfo.start_cursor,
            status: statusFilter,
            sort: sortOrder,
            cluster: clusterMode,
          })}
          className='text-sm underline'
          prefetch={false}
        >
          {t('extracted.admin.adminPagination.previous_a57b08a4')}
        </Link>
      ) : null}
      {pageInfo.has_next_page && pageInfo.end_cursor ? (
        <Link
          href={buildReportsPageHref({
            after: pageInfo.end_cursor,
            status: statusFilter,
            sort: sortOrder,
            cluster: clusterMode,
          })}
          className='text-sm underline'
          prefetch={false}
        >
          {t('extracted.admin.reportsClient.nextPage_c08ac736')}
        </Link>
      ) : null}
    </div>
  )
}

function StaffSortItems() {
  const t = useTranslations()
  return (
    <>
      <SelectItem value='severity'>
        {t('extracted.admin.reportsClient.severity_5e9f9812')}
      </SelectItem>
      <SelectItem
        value='most_reported'
        data-pw='reports-sort-option-most-reported'
      >
        {t('extracted.admin.reportsClient.mostReported_7838addd')}
      </SelectItem>
      <SelectItem value='created_at_asc'>
        {t('extracted.admin.reportsClient.oldestFirst_6e2ebdab')}
      </SelectItem>
      <SelectItem value='created_at_desc'>
        {t('extracted.admin.reportsClient.newestFirst_ffb6f576')}
      </SelectItem>
    </>
  )
}

function MemberSortItems() {
  const t = useTranslations()
  return (
    <>
      <SelectItem value='created_at_desc'>
        {t('extracted.admin.reportsClient.newestFirst_ffb6f576')}
      </SelectItem>
      <SelectItem value='created_at_asc'>
        {t('extracted.admin.reportsClient.oldestFirst_6e2ebdab')}
      </SelectItem>
    </>
  )
}
