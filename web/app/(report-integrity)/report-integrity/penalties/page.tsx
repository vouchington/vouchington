import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getReportIntegrityPenalties } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type {
  IntegrityPenaltyStatusFilter,
  ReportIntegrityPenaltiesResponse,
} from '@/types/report-integrity'
import { ReportIntegrityPenaltiesClient } from './report-integrity-penalties-client'
import { ApiError } from '@/lib/api/error'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Report Integrity Penalties | Admin')

export default async function ReportIntegrityPenaltiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const [params, t] = await Promise.all([searchParams, getTranslations()])
  const status: IntegrityPenaltyStatusFilter =
    params.status === 'revoked' || params.status === 'all' ? params.status : 'active'
  let available = true
  let initialData: ReportIntegrityPenaltiesResponse
  try {
    initialData = await getReportIntegrityPenalties<ReportIntegrityPenaltiesResponse>({
      searchParams: { status: status === 'all' ? undefined : status },
    })
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error
    available = false
    initialData = {
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
  }
  const path = '/report-integrity/penalties'
  const breadcrumbItems = buildBreadcrumbsForPath(path, {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [
      {
        name: t('extracted.flags.integrityPenalties.reportTitle_6f7f2d01'),
        path,
      },
    ],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <ReportIntegrityPenaltiesClient
        available={available}
        initialData={initialData}
        initialStatus={status}
      />
    </>
  )
}
