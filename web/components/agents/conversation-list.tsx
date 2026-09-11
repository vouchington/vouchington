'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { ConversationSearchForm } from './conversation-search-form'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { AgentConversationsResponseBody } from '@/types/agents'
import { getAgentDisplayName } from '@/lib/agents/display-name'
import { agentConversationHref, createAgentPathname } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ConversationListProps {
  data: AgentConversationsResponseBody
  agentIdOrSlug: string
}

export function ConversationList(props: ConversationListProps) {
  return (
    <Suspense fallback={null}>
      <ConversationListContent {...props} />
    </Suspense>
  )
}

function ConversationListContent({ data, agentIdOrSlug }: ConversationListProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const searchParams = useSearchParams()

  const [searchField, setSearchField] = useState(
    searchParams.get('username') ??
      searchParams.get('user_id') ??
      searchParams.get('post_id') ??
      searchParams.get('post_slug') ??
      searchParams.get('rss_feed_item_id') ??
      '',
  )
  const [searchType, setSearchType] = useState<string>(
    searchParams.get('username')
      ? 'username'
      : searchParams.get('user_id')
        ? 'user_id'
        : searchParams.get('post_id')
          ? 'post_id'
          : searchParams.get('post_slug')
            ? 'post_slug'
            : searchParams.get('rss_feed_item_id')
              ? 'rss_feed_item_id'
              : 'username',
  )

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!searchField.trim()) {
      push(createAgentPathname(agentIdOrSlug))
      return
    }
    push(
      `${createAgentPathname(agentIdOrSlug)}?${searchType}=${encodeURIComponent(searchField.trim())}`,
    )
  }

  const nextPageParams = {
    limit: 25,
    username: searchParams.get('username') || undefined,
    user_id: searchParams.get('user_id') || undefined,
    post_id: searchParams.get('post_id') || undefined,
    post_slug: searchParams.get('post_slug') || undefined,
    rss_feed_item_id: searchParams.get('rss_feed_item_id') || undefined,
  }
  const endpoint = `/api/v1/agents/${encodeURIComponent(agentIdOrSlug)}/conversations`
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, nextPageParams)
  const results = mergePageResultsById(pages)
  const users = mergeRecords(pages, page => page.users)

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2
          data-pw='agent-conversations-heading'
          className='text-xl font-semibold'
        >
          {t('extracted.agents.conversationList.conversations_1d432f58')}
        </h2>
      </div>

      <ConversationSearchForm
        searchType={searchType}
        searchField={searchField}
        onSearchTypeChange={setSearchType}
        onSearchFieldChange={setSearchField}
        onSubmit={handleSearch}
      />

      {results.length === 0 ? (
        <p className='text-muted-foreground'>
          {t('extracted.agents.conversationList.noConversationsFound_d444e99d')}
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
            {results.map(conversation => {
              const creator = users[conversation.created_by_id]

              return (
                <Link
                  key={conversation.id}
                  href={agentConversationHref(agentIdOrSlug, conversation)}
                  prefetch={false}
                  className='block rounded-lg border p-4 transition-colors hover:bg-accent'
                >
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='font-medium'>{conversation.title || 'Untitled Conversation'}</p>
                      <p className='text-sm text-muted-foreground'>
                        {t('extracted.agents.conversationList.byDisplayname_84a8631d', {
                          displayName: getAgentDisplayName(
                            creator,
                            conversation.created_by_id.slice(0, 8),
                          ),
                        })}
                      </p>
                    </div>
                    <p
                      className='text-sm text-muted-foreground'
                      suppressHydrationWarning
                    >
                      {new Date(conversation.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </InfiniteScroll>
      )}
    </div>
  )
}
