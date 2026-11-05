'use client'

import { Button } from '@/components/ui/button'
import { TimeAgo } from '@/components/shared/time-ago'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import type { DirectMessage } from '@/types/messages'
import { useTranslations } from '@/lib/i18n/use-translations'

export function DirectMessageList({
  messages,
  currentUserId,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  onClearError,
}: {
  messages: DirectMessage[]
  currentUserId: string
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: Error | null
  onLoadMore: () => void
  onClearError: () => void
}) {
  const t = useTranslations()
  return (
    <div
      className='flex-1 space-y-3 overflow-y-auto'
      data-pw='dm-thread-messages'
    >
      {hasMore && !loadMoreError ? (
        <div className='flex justify-center'>
          <Button
            variant='outline'
            size='sm'
            disabled={loadingMore}
            loading={loadingMore}
            data-pw='dm-load-more-button'
            onClick={() => {
              onLoadMore()
            }}
          >
            {t('extracted.conversationid.conversationPageClient.loadOlderMessages_f17671d8')}
          </Button>
        </div>
      ) : null}
      <PaginatedListFooter
        mode='retry-only'
        fetchError={loadMoreError}
        canLoadMore={hasMore}
        loadingMore={loadingMore}
        clearError={onClearError}
        loadMore={() => {
          onLoadMore()
        }}
      />
      {messages.length === 0 ? (
        <p className='text-center text-sm text-muted-foreground'>
          {t('extracted.conversationid.conversationPageClient.noMessagesYetSendTheFirst_0b71c4c3')}
        </p>
      ) : null}
      {messages.map(message => (
        <div
          key={message.id}
          className='rounded-lg border bg-card p-3'
        >
          <p className='text-sm font-medium text-muted-foreground'>
            {message.sender_username
              ? `@${message.sender_username}`
              : message.created_by_id === currentUserId
                ? t('extracted.conversationid.conversationPageClient.you_4a5b6c7d')
                : t('extracted.conversationid.conversationPageClient.member_8e9f0a1b')}
          </p>
          <p className='mt-1 whitespace-pre-wrap break-words text-sm'>{message.body_text}</p>
          <p className='mt-1 text-xs text-muted-foreground'>
            <TimeAgo date={message.created_at} />
          </p>
        </div>
      ))}
    </div>
  )
}
