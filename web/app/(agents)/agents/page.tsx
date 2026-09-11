import { getAgents } from '@/lib/api/server'
import { AgentListPage } from '@/components/agents/agent-list-page'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import type { Metadata } from 'next'
import type { AgentsResponseBody } from '@/types/agents'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Agents | Admin')

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AgentsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const limit = typeof params.limit === 'string' ? Number(params.limit) : 25

  const data = await getAgents<AgentsResponseBody>({
    searchParams: { limit },
  })

  const breadcrumbItems = buildBreadcrumbsForPath('/agents', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'Agents', path: '/agents' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <AgentListPage data={data} />
    </>
  )
}
