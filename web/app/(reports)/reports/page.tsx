import {
  getMemberPendingModerationReports,
  getStaffPendingModerationReports,
} from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import type { Metadata } from 'next'
import * as Sentry from '@sentry/nextjs'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { ReportsClient } from '@/components/admin/reports-client'
import type { ModerationReportSortParam } from '@/lib/api/client/reports'
import { getTranslations } from '@/lib/i18n/get-translations'
import type { ReactNode } from 'react'

export const metadata: Metadata = createNoIndexMetadata('Reports')

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const after = typeof params.after === 'string' ? params.after : undefined
  const before = typeof params.before === 'string' ? params.before : undefined
  const statusParam = typeof params.status === 'string' ? params.status : undefined
  const sortParam = typeof params.sort === 'string' ? params.sort : undefined
  const clusterParam = typeof params.cluster === 'string' ? params.cluster : undefined

  const currentUser = await getCurrentUser()
  const isStaff =
    (currentUser?.roles.includes('administrator') ?? false) ||
    (currentUser?.roles.includes('moderator') ?? false)
  const canBulkRemoveReports = currentUser?.roles.includes('administrator') ?? false
  const sort = getModerationReportSort(sortParam, isStaff)
  const requestedFlatStaffSort =
    isStaff && (sortParam === 'severity' || sortParam === 'most_reported')
  const useClusteredReports = isStaff && clusterParam !== 'none' && !requestedFlatStaffSort
  const clusteredSort =
    sortParam === 'created_at_asc' || sortParam === 'created_at_desc'
      ? sortParam
      : 'created_at_desc'
  const requestSort = useClusteredReports ? clusteredSort : sort

  let reportsClient: ReactNode
  if (isStaff) {
    let effectiveAfter = after
    let effectiveClusterMode: 'entity' | 'none' = useClusteredReports ? 'entity' : 'none'
    let data
    try {
      data = await getStaffPendingModerationReports({
        searchParams: {
          limit: 50,
          ...(after ? { after } : {}),
          ...(before ? { before } : {}),
          ...(statusParam ? { status: statusParam } : {}),
          sort: requestSort,
          ...(useClusteredReports ? { cluster: 'entity' as const } : {}),
        },
      })
    } catch (error) {
      if (!useClusteredReports) throw error
      Sentry.captureException(error)
      effectiveAfter = undefined
      effectiveClusterMode = 'none'
      data = await getStaffPendingModerationReports({
        searchParams: {
          limit: 50,
          ...(statusParam ? { status: statusParam } : {}),
          sort,
        },
      })
    }
    reportsClient = (
      <ReportsClient
        viewerTier='staff'
        data={data}
        canBulkRemove={canBulkRemoveReports}
        statusFilter={statusParam}
        sortOrder={effectiveClusterMode === 'entity' ? requestSort : sort}
        currentAfter={effectiveAfter}
        clusterMode={effectiveClusterMode}
      />
    )
  } else {
    const data = await getMemberPendingModerationReports({
      searchParams: {
        limit: 50,
        ...(after ? { after } : {}),
        ...(before ? { before } : {}),
        ...(statusParam ? { status: statusParam } : {}),
        sort,
      },
    })
    reportsClient = (
      <ReportsClient
        viewerTier='member'
        data={data}
        statusFilter={statusParam}
        sortOrder={sort}
        currentAfter={after}
      />
    )
  }

  const breadcrumbItems = buildBreadcrumbsForPath('/reports', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Reports', path: '/reports' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <div className='mt-4 space-y-4'>
        <div data-pw='reports-heading'>
          <AdminPageHeader
            title={t('extracted.reports.page.moderationReports_7824479e')}
            description={
              isStaff
                ? t('extracted.reports.page.reviewUserSubmittedReportsAndJump_9a1c4e83')
                : t('extracted.reports.page.reportsSubmittedAboutContentOnThis_5d6b3f27')
            }
          />
        </div>
        {reportsClient}
      </div>
    </>
  )
}

function getModerationReportSort(
  rawSort: string | undefined,
  isStaff: boolean,
): ModerationReportSortParam {
  if (isStaff) {
    if (
      rawSort === 'severity' ||
      rawSort === 'most_reported' ||
      rawSort === 'created_at_asc' ||
      rawSort === 'created_at_desc'
    ) {
      return rawSort
    }
    return 'severity'
  }
  return rawSort === 'created_at_asc' ? 'created_at_asc' : 'created_at_desc'
}
