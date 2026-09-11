import { notFound } from 'next/navigation'
import { getAgent, getAgentConversations } from '@/lib/api/server'
import { AgentDetail } from '@/components/agents/agent-detail'
import { ConversationList } from '@/components/agents/conversation-list'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import type { Metadata } from 'next'
import type { AgentResponseBody, AgentConversationsResponseBody } from '@/types/agents'
import { createAgentPathname } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Agent Detail')

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ idOrSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AgentDetailPage({ params, searchParams }: PageProps) {
  const { idOrSlug } = await params
  const search = await searchParams

  const agentData = await getAgent<AgentResponseBody>(idOrSlug)
  if (!agentData) notFound()
  const { agent, user } = agentData

  const conversationsData = await getAgentConversations<AgentConversationsResponseBody>(idOrSlug, {
    searchParams: {
      limit: 25,
      user_id: typeof search.user_id === 'string' ? search.user_id : undefined,
      username: typeof search.username === 'string' ? search.username : undefined,
      post_id: typeof search.post_id === 'string' ? search.post_id : undefined,
      post_slug: typeof search.post_slug === 'string' ? search.post_slug : undefined,
      rss_feed_item_id:
        typeof search.rss_feed_item_id === 'string' ? search.rss_feed_item_id : undefined,
    },
  })

  const breadcrumbItems = buildBreadcrumbsForPath(createAgentPathname(idOrSlug), {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [
      { name: 'Agents', path: '/agents' },
      { name: idOrSlug, path: createAgentPathname(idOrSlug) },
    ],
  })

  return (
    <div className='space-y-6'>
      <Breadcrumbs items={breadcrumbItems} />
      <AgentDetail
        agent={agent}
        user={user}
      />
      <ConversationList
        data={conversationsData}
        agentIdOrSlug={idOrSlug}
      />
    </div>
  )
}
