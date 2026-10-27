import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getReportIntegrityPenalties, getReportIntegrityPenaltyReviewsDue } from '@/lib/api/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getTranslations } from '@/lib/i18n/get-translations'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type {
  IntegrityPenaltyStatusFilter,
  ReportIntegrityPenaltyReviewsDueResponse,
  ReportIntegrityPenaltiesResponse,
} from '@/types/report-integrity'
import { ReportIntegrityPenaltiesClient } from './report-integrity-penalties-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Report Integrity Penalties | Admin')

export default async function ReportIntegrityPenaltiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requireAdmin()
  const [params, t] = await Promise.all([searchParams, getTranslations()])
  const status: IntegrityPenaltyStatusFilter =
    params.status === 'revoked' || params.status === 'all' ? params.status : 'active'
  const [initialData, initialDuePage] = await Promise.all([
    getReportIntegrityPenalties<ReportIntegrityPenaltiesResponse>({
      searchParams: { status: status === 'all' ? undefined : status },
    }),
    status === 'active'
      ? getReportIntegrityPenaltyReviewsDue<ReportIntegrityPenaltyReviewsDueResponse>()
      : null,
  ])
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
        initialDuePage={initialDuePage}
        initialData={initialData}
        initialStatus={status}
      />
    </>
  )
}
