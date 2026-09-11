'use client'

import type { WebCrmMessage } from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  messages: WebCrmMessage[]
}

export function CrmContactEmailHistory({ messages }: Props) {
  const t = useTranslations()
  if (messages.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.contactid.crmContactEmailHistory.noEmailsYet_956cfef7')}
      </p>
    )
  }

  return (
    <div className='space-y-3'>
      {messages.map(msg => (
        <div
          key={msg.id}
          className='rounded-md border bg-card p-4'
        >
          <div className='flex items-start justify-between gap-4'>
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium text-foreground'>
                {msg.subject ?? t('extracted.contactid.crmContactEmailHistory.noSubject_53f5067d')}
              </p>
              <p className='mt-0.5 text-xs text-muted-foreground'>
                {msg.direction === 'outbound'
                  ? t('extracted.contactid.crmContactEmailHistory.toEmail_53192bbf', {
                      email: msg.to_email,
                    })
                  : t('extracted.contactid.crmContactEmailHistory.fromEmail_c5820966', {
                      email: msg.from_email,
                    })}
                {msg.email_provider && (
                  <span className='ml-2 text-xs text-muted-foreground'>
                    {t('extracted.contactid.crmContactEmailHistory.viaProvider_0cd0cc27', {
                      provider: msg.email_provider === 'gmail_smtp' ? 'Gmail' : 'SES',
                    })}
                  </span>
                )}
              </p>
            </div>
            <div className='shrink-0 text-right'>
              <DirectionBadge direction={msg.direction} />
              <p className='mt-1 text-xs text-muted-foreground'>{formatMessageDate(msg)}</p>
            </div>
          </div>
          {msg.body_text && (
            <p className='mt-2 line-clamp-2 text-sm text-muted-foreground'>{msg.body_text}</p>
          )}
          {msg.bounced_at && (
            <p className='mt-1 text-xs text-destructive'>
              {t('extracted.contactid.crmContactEmailHistory.bounced_b23b4c73')}
            </p>
          )}
          {msg.ai_generated_at && (
            <p className='mt-1 text-xs text-muted-foreground'>
              {t('extracted.contactid.crmContactEmailHistory.aiGenerated_cc7ff1bf')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function DirectionBadge({ direction }: { direction: string }) {
  const t = useTranslations()
  const isOutbound = direction === 'outbound'
  return (
    <span
      className={
        isOutbound
          ? 'rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary'
          : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
      }
    >
      {isOutbound
        ? t('extracted.contactid.crmContactEmailHistory.sent_c16bc82b')
        : t('extracted.contactid.crmContactEmailHistory.received_49f19bee')}
    </span>
  )
}

function formatMessageDate(msg: WebCrmMessage): string {
  const date = msg.sent_at ?? msg.received_at ?? msg.created_at
  return new Date(date).toLocaleString()
}
