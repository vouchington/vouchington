'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { TimeAgo } from '@/components/shared/time-ago'
import { getMyMessagesClient } from '@/lib/api/client/messages'
import { messagesHref } from '@/lib/links/entity-href'
import onError from '@/lib/on-error'
import type { DirectConversation } from '@/types/messages'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialConversations: DirectConversation[]
  initialHasMore: boolean
  initialEndCursor: string | null
}

export function MessagesInboxClient({
  initialConversations,
  initialHasMore,
  initialEndCursor,
}: Props) {
  const t = useTranslations()
  const [conversations, setConversations] = useState<DirectConversation[]>(initialConversations)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [endCursor, setEndCursor] = useState<string | null>(initialEndCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetchError, setFetchError] = useState<Error | null>(null)
  const [refreshGeneration, setRefreshGeneration] = useState(0)
  const activeRequestRef = useRef(false)
  const generationRef = useRef(0)

  function mergeByRecentActivity(
    current: DirectConversation[],
    incoming: DirectConversation[],
  ): DirectConversation[] {
    const byId = new Map(current.map(conversation => [conversation.id, conversation]))
    for (const conversation of incoming) byId.set(conversation.id, conversation)
    return [...byId.values()].toSorted(
      (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || b.id.localeCompare(a.id),
    )
  }

  useEffect(() => {
    const generation = ++generationRef.current
    async function refreshPageOne() {
      if (activeRequestRef.current) return
      activeRequestRef.current = true
      try {
        const res = await getMyMessagesClient()
        if (generationRef.current !== generation) return
        setConversations(prev => mergeByRecentActivity(prev, res.results))
        setHasMore(res.page_info.has_next_page)
        setEndCursor(res.page_info.end_cursor)
        setRefreshGeneration(value => value + 1)
      } catch {
        // Focus refresh is opportunistic; preserve the rendered inbox on failure.
      } finally {
        activeRequestRef.current = false
      }
    }
    window.addEventListener('focus', refreshPageOne)
    return () => {
      generationRef.current += 1
      window.removeEventListener('focus', refreshPageOne)
    }
  }, [])

  async function handleLoadMore() {
    if (!endCursor || activeRequestRef.current) return
    const generation = generationRef.current
    activeRequestRef.current = true
    setLoadingMore(true)
    setFetchError(null)
    try {
      const res = await getMyMessagesClient(endCursor)
      if (generationRef.current !== generation) return
      setConversations(prev => mergeByRecentActivity(prev, res.results))
      setHasMore(res.page_info.has_next_page)
      setEndCursor(res.page_info.end_cursor)
    } catch (error) {
      setFetchError(error instanceof Error ? error : new Error(String(error)))
      onError(error, {
        fallback: t(
          'extracted.messages.messagesInboxClient.failedToLoadMoreConversations_f291e2fe',
        ),
      })
    } finally {
      activeRequestRef.current = false
      setLoadingMore(false)
    }
  }

  if (conversations.length === 0) {
    return (
      <div className='rounded-lg border bg-card p-12 text-center'>
        <p className='text-muted-foreground'>
          {t('extracted.messages.messagesInboxClient.noMessagesYet_f0d5968f')}
        </p>
      </div>
    )
  }

  return (
    <InfiniteScroll
      hasNextPage={hasMore}
      endCursor={endCursor}
      onLoadMore={handleLoadMore}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={() => setFetchError(null)}
      resetKey={refreshGeneration}
    >
      <div className='divide-y rounded-lg border bg-card'>
        {conversations.map(conversation => (
          <Link
            key={conversation.id}
            href={messagesHref(conversation)}
            prefetch={false}
            className='flex items-center justify-between p-4 hover:bg-muted/50'
            data-pw='messages-inbox-item'
          >
            <span className='font-medium'>
              {conversation.participant_usernames?.filter(Boolean).join(', ') ||
                conversation.title ||
                t('extracted.messages.messagesInboxClient.directMessage_2b3c4d5e')}
            </span>
            <span className='text-sm text-muted-foreground'>
              <TimeAgo date={conversation.updated_at} />
            </span>
          </Link>
        ))}
      </div>
    </InfiniteScroll>
  )
}
