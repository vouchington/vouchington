import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { SupportMessage } from '@/types/support'
import { AdminSupportMessageCard } from './admin-support-message-card'

interface AdminSupportThreadMessageListProps {
  clearError: () => void
  fetchError: unknown
  hasNextPage: boolean
  loadMore: () => void
  loadingMore: boolean
  messages: SupportMessage[]
  onMessageUpdate: (message: SupportMessage) => void
  onRefreshMessages: () => Promise<void>
  threadId: string
  threadResolved: boolean
}

export function AdminSupportThreadMessageList({
  clearError,
  fetchError,
  hasNextPage,
  loadMore,
  loadingMore,
  messages,
  onMessageUpdate,
  onRefreshMessages,
  threadId,
  threadResolved,
}: AdminSupportThreadMessageListProps) {
  const t = useTranslations()
  return (
    <>
      {hasNextPage && (
        <div className='flex justify-center'>
          <Button
            variant='outline'
            size='sm'
            onClick={loadMore}
            loading={loadingMore}
            disabled={loadingMore}
          >
            {t('extracted.threadid.adminSupportThreadDetailClient.loadOlderMessages_f17671d8')}
          </Button>
        </div>
      )}
      {fetchError && (
        <div className='flex justify-center gap-2 text-sm text-destructive'>
          <span>
            {t(
              'extracted.threadid.adminSupportThreadDetailClient.failedToLoadOlderMessages_a326f2e3',
            )}
          </span>
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              clearError()
              loadMore()
            }}
          >
            {t('extracted.threadid.adminSupportThreadDetailClient.retry_942087cc')}
          </Button>
        </div>
      )}
      <div className='space-y-3'>
        {messages.length === 0 && (
          <div
            data-pw='support-thread-empty-messages'
            className='rounded-lg border bg-card p-8 text-center text-muted-foreground'
          >
            {t('extracted.threadid.adminSupportThreadDetailClient.noMessagesYet_f42e0f66')}
          </div>
        )}
        {messages.map(message => (
          <AdminSupportMessageCard
            key={message.id}
            message={message}
            threadId={threadId}
            onMessageUpdate={onMessageUpdate}
            onRefreshMessages={onRefreshMessages}
            threadResolved={threadResolved}
          />
        ))}
      </div>
    </>
  )
}
