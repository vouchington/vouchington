import { Badge } from '@/components/ui/badge'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { SupportMessage } from '@/types/support'

export function AdminSupportMessageMetadata({
  isApproved,
  isDraft,
  message,
}: {
  isApproved: boolean
  isDraft: boolean
  message: SupportMessage
}) {
  const t = useTranslations()
  return (
    <div className='mb-2 flex items-center gap-2 text-xs text-muted-foreground'>
      <span className='font-medium uppercase'>{message.direction}</span>
      {message.email_from && (
        <span>
          {t('extracted.threadid.adminSupportMessageCard.fromEmail_99dab09a', {
            email: message.email_from,
          })}
        </span>
      )}
      {message.email_to && (
        <span>
          {t('extracted.threadid.adminSupportMessageCard.toEmail_b2fee174', {
            email: message.email_to,
          })}
        </span>
      )}
      <span
        className='ml-auto'
        suppressHydrationWarning
      >
        {new Date(message.created_at).toLocaleString()}
      </span>
      {message.sent_at && (
        <Badge
          variant='outline'
          className='text-xs'
        >
          {t('extracted.threadid.adminSupportMessageCard.sent_7afbb334')}
        </Badge>
      )}
      {isDraft && (
        <Badge className='bg-orange-100 text-orange-800 text-xs hover:bg-orange-100 dark:bg-orange-900 dark:text-orange-200'>
          {t('extracted.threadid.adminSupportMessageCard.draft_7743ce34')}
        </Badge>
      )}
      {isApproved && (
        <Badge className='bg-green-100 text-green-800 text-xs hover:bg-green-100 dark:bg-green-900 dark:text-green-200'>
          {t('extracted.threadid.adminSupportMessageCard.approved_2687f86e')}
        </Badge>
      )}
    </div>
  )
}
