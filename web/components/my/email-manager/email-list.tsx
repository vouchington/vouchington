'use client'

import { Button } from '@/components/ui/button'
import type { EmailAddress } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface EmailListProps {
  emails: EmailAddress[]
  loading: boolean
  onRemove: (emailAddress: string) => void
  onSetPrimary: (emailAddress: string) => void
}

export function EmailList({ emails, loading, onRemove, onSetPrimary }: EmailListProps) {
  const t = useTranslations()
  if (emails.length === 0) {
    return <p className='text-sm text-muted-foreground'>No email addresses yet</p>
  }
  return (
    <ul className='space-y-2'>
      {emails.map(email => (
        <li
          key={email.email_address}
          className='flex items-center justify-between rounded-md border p-4'
        >
          <div className='flex items-center gap-2'>
            <span className='text-sm'>{email.email_address}</span>
            {email.is_primary && (
              <span className='rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary'>
                {t('extracted.emailManager.emailList.primary_efe10c80')}
              </span>
            )}
          </div>
          <div className='flex gap-2'>
            {!email.is_primary && (
              <>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => onSetPrimary(email.email_address)}
                  disabled={loading}
                >
                  {t('extracted.emailManager.emailList.setPrimary_2de22c7d')}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => onRemove(email.email_address)}
                  disabled={loading}
                >
                  {t('extracted.emailManager.emailList.remove_c3812fc4')}
                </Button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
