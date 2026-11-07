'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import {
  getModmailMessagesClient,
  type ModmailThread,
  type ModmailMessage,
} from '@/lib/api/client/modmail'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ModmailMessageList } from './modmail-message-list'
import { ModmailThreadComposeForm } from './modmail-thread-compose-form'
import { ModmailThreadHeader } from './modmail-thread-header'

interface Props {
  communitySlug: string
  thread: ModmailThread
  initialMessages: ModmailMessage[]
  initialHasMore: boolean
  initialEndCursor: string | null
  isMod: boolean
}

export function ModmailThreadClient({
  communitySlug,
  thread: initialThread,
  initialMessages,
  initialHasMore,
  initialEndCursor,
  isMod,
}: Props) {
  const t = useTranslations()
  const [messages, setMessages] = useState<ModmailMessage[]>(initialMessages)
  const [thread, setThread] = useState<ModmailThread>(initialThread)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<Error | null>(null)
  const endCursorRef = useRef<string | null>(initialEndCursor)
  const generationRef = useRef(0)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    generationRef.current += 1
    return () => {
      generationRef.current += 1
    }
  }, [communitySlug, initialThread.id])

  async function handleLoadMore() {
    const cursor = endCursorRef.current
    if (!cursor || loadingMoreRef.current) return
    const generation = generationRef.current
    const contextSlug = communitySlug
    const contextThreadId = thread.id
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const res = await getModmailMessagesClient(contextSlug, contextThreadId, {
        after: cursor,
      })
      if (
        generation !== generationRef.current ||
        contextSlug !== communitySlug ||
        contextThreadId !== thread.id
      )
        return
      setMessages(prev => prependUniqueMessages(prev, res.results))
      setHasMore(res.page_info.has_next_page)
      endCursorRef.current = res.page_info.end_cursor
    } catch (err) {
      if (
        generation === generationRef.current &&
        contextSlug === communitySlug &&
        contextThreadId === thread.id
      ) {
        setLoadMoreError(err instanceof Error ? err : new Error(String(err)))
        onError(err, {
          fallback: t('extracted.threadid.modmailThreadClient.failedToLoadMoreMessages_d37c5429'),
        })
      }
    } finally {
      if (
        generation === generationRef.current &&
        contextSlug === communitySlug &&
        contextThreadId === thread.id
      ) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }

  return (
    <div
      className='flex flex-col gap-4'
      data-pw='modmail-thread-view'
    >
      <ModmailThreadHeader
        communitySlug={communitySlug}
        thread={thread}
        isMod={isMod}
        onResolved={setThread}
      />

      {hasMore && !loadMoreError ? (
        <div className='flex justify-center'>
          <Button
            variant='outline'
            size='sm'
            disabled={loadingMore}
            loading={loadingMore}
            data-pw='modmail-thread-load-more'
            onClick={() => {
              void handleLoadMore()
            }}
          >
            {t('extracted.threadid.modmailThreadClient.loadOlderMessages_f17671d8')}
          </Button>
        </div>
      ) : null}
      <PaginatedListFooter
        mode='retry-only'
        fetchError={loadMoreError}
        canLoadMore={hasMore}
        loadingMore={loadingMore}
        clearError={() => setLoadMoreError(null)}
        loadMore={() => {
          void handleLoadMore()
        }}
      />

      <ModmailMessageList messages={messages} />

      {!thread.resolved_at && (
        <ModmailThreadComposeForm
          communitySlug={communitySlug}
          threadId={thread.id}
          onSent={message => {
            setMessages(prev => [...prev, message])
          }}
        />
      )}
    </div>
  )
}

function prependUniqueMessages(
  existing: ModmailMessage[],
  incoming: ModmailMessage[],
): ModmailMessage[] {
  const seen = new Set(existing.map(message => message.id))
  const uniqueIncoming = incoming.filter(message => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
  return [...uniqueIncoming, ...existing]
}
