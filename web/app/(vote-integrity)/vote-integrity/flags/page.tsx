import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getVoteIntegrityFlags } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { VoteIntegrityFlagsResponse, StatusFilter } from '@/types/vote-integrity'
import { INTEGRITY_FLAG_STATUS_FILTERS } from '@ts-shared/utils/moderation-catalogs'
import { VoteIntegrityFlagsClient } from './vote-integrity-flags-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Vote Integrity | Admin')

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function VoteIntegrityFlagsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const status = INTEGRITY_FLAG_STATUS_FILTERS.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : 'pending'
  const initialData = await getVoteIntegrityFlags<VoteIntegrityFlagsResponse>({
    searchParams: {
      status: status !== 'all' ? status : undefined,
    },
  })

  const breadcrumbItems = buildBreadcrumbsForPath('/vote-integrity/flags', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'Vote Integrity', path: '/vote-integrity/flags' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <VoteIntegrityFlagsClient
        initialData={initialData}
        initialStatus={status}
      />
    </>
  )
}
