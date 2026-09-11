'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DynamicConfigHistoryEntry } from '@/lib/api/client/dynamic-config'
import { useTranslations } from '@/lib/i18n/use-translations'

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function DynamicConfigHistory({ history }: { history: DynamicConfigHistoryEntry[] }) {
  const t = useTranslations()
  return (
    <Card data-pw='dynamic-config-history'>
      <CardHeader>
        <CardTitle>{t('extracted.dynamicConfig.history.changeHistory_b6e82749')}</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.dynamicConfig.history.noChangesRecorded_fc21a407')}
          </p>
        ) : (
          <div className='space-y-3'>
            {history.map(entry => (
              <div
                key={entry.id}
                className='rounded-md border p-3'
                data-pw='dynamic-config-history-entry'
              >
                <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
                  <span className='font-medium'>
                    {entry.changed_by?.username ?? entry.changed_by?.id ?? 'Deleted user'}
                  </span>
                  <time
                    className='text-muted-foreground'
                    suppressHydrationWarning
                  >
                    {formatTimestamp(entry.created_at)}
                  </time>
                </div>
                <dl className='mt-3 grid gap-2'>
                  {Object.entries(entry.changed_fields).map(([field, change]) => (
                    <div
                      key={field}
                      className='grid gap-1 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'
                    >
                      <dt className='font-mono text-muted-foreground'>{field}</dt>
                      <dd className='font-mono'>{String(change.previous)}</dd>
                      <dd className='font-mono'>{String(change.next)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatTimestamp(value: string): string {
  return DATE_TIME_FORMAT.format(new Date(value))
}
