import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getReportIntegrityFlags } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { ReportIntegrityFlagsResponse, StatusFilter } from '@/types/report-integrity'
import { INTEGRITY_FLAG_STATUS_FILTERS } from '@ts-shared/utils/moderation-catalogs'
import { ReportIntegrityFlagsClient } from './report-integrity-flags-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Report Integrity | Admin')

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function ReportIntegrityFlagsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const status = INTEGRITY_FLAG_STATUS_FILTERS.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : 'pending'
  const initialData = await getReportIntegrityFlags<ReportIntegrityFlagsResponse>({
    searchParams: {
      status: status !== 'all' ? status : undefined,
    },
  })

  const breadcrumbItems = buildBreadcrumbsForPath('/report-integrity/flags', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'Report Integrity', path: '/report-integrity/flags' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <ReportIntegrityFlagsClient
        initialData={initialData}
        initialStatus={status}
      />
    </>
  )
}
