import { notFound } from 'next/navigation'
import { getAgent, getAgentConversation } from '@/lib/api/server'
import { ConversationDetail } from '@/components/agents/conversation-detail'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import type { Metadata } from 'next'
import type { AgentResponseBody, AgentConversationDetailResponseBody } from '@/types/agents'
import { agentConversationHref, createAgentPathname } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Conversation Detail')

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ idOrSlug: string; id: string }>
}

export default async function ConversationDetailPage({ params }: PageProps) {
  const { idOrSlug, id } = await params

  const agentData = await getAgent<AgentResponseBody>(idOrSlug)
  if (!agentData) notFound()
  const agent = agentData.agent
  const data = await getAgentConversation<AgentConversationDetailResponseBody>(idOrSlug, id)
  if (!data) notFound()

  const breadcrumbItems = buildBreadcrumbsForPath(agentConversationHref(idOrSlug, id), {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [
      { name: 'Agents', path: '/agents' },
      { name: idOrSlug, path: createAgentPathname(idOrSlug) },
      { name: 'Conversation', path: agentConversationHref(idOrSlug, id) },
    ],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <ConversationDetail
        agent={agent}
        conversation={data.conversation}
        messages={data.results}
        pageInfo={data.page_info}
      />
    </>
  )
}
