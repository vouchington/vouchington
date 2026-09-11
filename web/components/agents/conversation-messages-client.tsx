'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import type { ConversationMessage } from '@/types/agents'
import type { PageInfo } from '@/types/api-responses'

interface MessagesPage {
  results: ConversationMessage[]
  page_info: PageInfo
}

interface Props {
  initialData: MessagesPage
  endpoint: string
  agentSystemUserId: string
  agentLabel: string
  userLabel: string
  emptyLabel: string
  loadingLabel: string
  loadOlderLabel: string
  retryLabel: string
}

const paginationOptions = { limit: 50 } as const

export function ConversationMessagesClient(props: Props) {
  const { pages, hasNextPage, loadMore, loadingMore, fetchError, clearError } = usePaginatedList(
    props.initialData,
    props.endpoint,
    paginationOptions,
  )
  const messages = useMemo(() => {
    const byId = new Map<string, ConversationMessage>()
    for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex -= 1) {
      const page = pages[pageIndex]
      if (!page) continue
      for (const message of page.results) byId.set(message.id, message)
    }
    return [...byId.values()]
  }, [pages])

  return (
    <div className='space-y-4'>
      {hasNextPage ? (
        <Button
          type='button'
          variant='outline'
          loading={loadingMore}
          onClick={() => {
            void loadMore()
          }}
        >
          {loadingMore ? props.loadingLabel : props.loadOlderLabel}
        </Button>
      ) : null}
      {fetchError ? (
        <Button
          type='button'
          variant='link'
          className='h-auto p-0 text-destructive'
          onClick={() => {
            clearError()
            void loadMore()
          }}
        >
          {props.retryLabel}
        </Button>
      ) : null}
      {messages.map(message => {
        const content = message.content
        const isAgent = message.created_by_id === props.agentSystemUserId
        return (
          <div
            key={message.id}
            className={`rounded-lg border p-4 ${isAgent ? 'bg-muted/50' : 'bg-background'}`}
          >
            <div className='mb-2 flex items-center gap-2 text-xs text-muted-foreground'>
              <span className='font-medium'>{isAgent ? props.agentLabel : props.userLabel}</span>
              <span suppressHydrationWarning>{new Date(message.created_at).toLocaleString()}</span>
            </div>
            <div className='whitespace-pre-wrap text-sm'>
              {content?.content ?? content?.error ?? props.emptyLabel}
            </div>
          </div>
        )
      })}
    </div>
  )
}
