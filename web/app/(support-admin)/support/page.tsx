import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getAdminSupportThreads } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { AdminSupportThreadsClient } from './admin-support-threads-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Support | Admin')

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function getFirstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminSupportPage({ searchParams }: PageProps) {
  const params = await searchParams
  const requestedStatus = getFirstSearchParam(params.status)
  const status =
    requestedStatus === 'open' || requestedStatus === 'assigned' || requestedStatus === 'resolved'
      ? requestedStatus
      : undefined
  const q = getFirstSearchParam(params.q)?.trim() || undefined

  const initialData = await getAdminSupportThreads({
    q,
    status,
    limit: 30,
  })

  const breadcrumbItems = buildBreadcrumbsForPath('/support', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'Support', path: '/support' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <AdminSupportThreadsClient
        initialData={initialData}
        initialQ={q}
        initialStatus={status}
      />
    </>
  )
}
