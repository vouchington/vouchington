'use client'

import Link from 'next/link'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { AgentsResponseBody } from '@/types/agents'
import { getAgentDisplayName } from '@/lib/agents/display-name'
import { agentHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AgentListPageProps {
  data: AgentsResponseBody
}

export function AgentListPage({ data }: AgentListPageProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, '/api/v1/agents', { limit: 25 })
  const results = mergePageResultsById(pages)
  const users = mergeRecords(pages, page => page.users)

  return (
    <div className='space-y-4'>
      <div>
        <h1
          data-pw='agents-page-heading'
          className='text-2xl font-bold tracking-tight'
        >
          {t('extracted.agents.agentListPage.agents_279b44d2')}
        </h1>
        <p className='mt-2 text-muted-foreground'>
          {t('extracted.agents.agentListPage.viewAndManageAiAgents_dfd4282a')}
        </p>
      </div>

      {results.length === 0 ? (
        <p className='text-muted-foreground'>
          {t('extracted.agents.agentListPage.noAgentsFound_61666542')}
        </p>
      ) : (
        <InfiniteScroll
          hasNextPage={hasNextPage}
          endCursor={endCursor}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          fetchError={fetchError}
          clearError={clearError}
          resetKey={resetKey}
        >
          <div className='space-y-2'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b text-left text-muted-foreground'>
                  <th
                    scope='col'
                    className='pb-2 font-medium'
                  >
                    {t('extracted.agents.agentListPage.agent_11b39c93')}
                  </th>
                  <th
                    scope='col'
                    className='pb-2 font-medium'
                  >
                    {t('extracted.agents.agentListPage.type_baaddf70')}
                  </th>
                  <th
                    scope='col'
                    className='pb-2 font-medium'
                  >
                    {t('extracted.agents.agentListPage.status_920e413c')}
                  </th>
                  <th
                    scope='col'
                    className='pb-2 font-medium'
                  >
                    {t('extracted.agents.agentListPage.created_d70b9e24')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map(agent => {
                  const user = users[agent.system_user_id]
                  const isActive = agent.activated_at && !agent.deactivated_at
                  const displayName = getAgentDisplayName(user, agent.system_user_id.slice(0, 8))

                  return (
                    <tr
                      key={agent.id}
                      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                      data-pw={`agent-row-${agent.id}`}
                      className='border-b'
                    >
                      <td className='py-3'>
                        <Link
                          href={agentHref(agent)}
                          prefetch={false}
                          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                          data-pw={`agent-row-link-${agent.id}`}
                          className='font-medium text-primary hover:underline'
                        >
                          {displayName}
                        </Link>
                      </td>
                      <td className='py-3 capitalize'>{agent.agent_type}</td>
                      <td className='py-3'>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            isActive
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td
                        className='py-3 text-muted-foreground'
                        suppressHydrationWarning
                      >
                        {new Date(agent.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </InfiniteScroll>
      )}
    </div>
  )
}
