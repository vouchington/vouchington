import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getVoteIntegrityPenalties } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type {
  IntegrityPenaltyStatusFilter,
  VoteIntegrityPenaltiesResponse,
} from '@/types/vote-integrity'
import { VoteIntegrityPenaltiesClient } from './vote-integrity-penalties-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Vote Integrity Penalties | Admin')

export default async function VoteIntegrityPenaltiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const [params, t] = await Promise.all([searchParams, getTranslations()])
  const status: IntegrityPenaltyStatusFilter =
    params.status === 'revoked' || params.status === 'all' ? params.status : 'active'
  const initialData = await getVoteIntegrityPenalties<VoteIntegrityPenaltiesResponse>({
    searchParams: { source: 'flag', status: status === 'all' ? undefined : status },
  })
  const path = '/vote-integrity/penalties'
  const breadcrumbItems = buildBreadcrumbsForPath(path, {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [
      {
        name: t('extracted.flags.integrityPenalties.voteTitle_3a621e8c'),
        path,
      },
    ],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <VoteIntegrityPenaltiesClient
        initialData={initialData}
        initialStatus={status}
      />
    </>
  )
}
