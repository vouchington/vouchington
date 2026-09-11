'use client'

import { TimeAgo } from '@/components/shared/time-ago'
import type { ModmailMessage } from '@/lib/api/client/modmail'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ModmailMessageListProps {
  messages: ModmailMessage[]
}

export function ModmailMessageList({ messages }: ModmailMessageListProps) {
  const t = useTranslations()
  return (
    <div
      className='space-y-3'
      data-pw='modmail-thread-messages'
    >
      {messages.length === 0 ? (
        <p className='text-center text-sm text-muted-foreground'>
          {t('extracted.threadid.modmailThreadClient.noMessagesYet_f0d5968f')}
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
              : t('extracted.threadid.modmailThreadClient.member_7c968fb7')}
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
