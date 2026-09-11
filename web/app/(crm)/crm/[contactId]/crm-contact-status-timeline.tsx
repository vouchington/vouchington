'use client'

import type { WebCrmContact } from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

export function StatusTimeline({ contact }: { contact: WebCrmContact }) {
  const t = useTranslations()
  const events: Array<{ label: string; date: string | null }> = [
    { label: 'Created', date: contact.created_at },
    { label: 'Contacted', date: contact.contacted_at },
    { label: 'Responded', date: contact.responded_at },
    { label: 'Converted', date: contact.converted_at },
    { label: 'Opted Out', date: contact.opted_out_at },
    { label: 'Archived', date: contact.archived_at },
  ]

  const activeEvents = events.filter(e => e.date !== null)

  if (activeEvents.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.contactid.crmContactStatusTimeline.noStatusEventsYet_1ecd2d0f')}
      </p>
    )
  }

  return (
    <div className='space-y-2'>
      {activeEvents.map(event => (
        <div
          key={event.label}
          className='flex items-center gap-3 text-sm'
        >
          <span className='w-24 shrink-0 font-medium text-foreground'>{event.label}</span>
          <span
            className='text-muted-foreground'
            suppressHydrationWarning
          >
            {new Date(event.date!).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}
