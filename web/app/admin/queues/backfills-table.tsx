'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import type { Backfill } from '@/lib/api/client/mq'
import { useTranslations } from '@/lib/i18n/use-translations'

export function BackfillsTable({
  actionLoading,
  backfills,
  onPendingBackfillChange,
}: {
  actionLoading: Record<string, boolean>
  backfills: Backfill[]
  onPendingBackfillChange: (backfill: Backfill) => void
}) {
  const t = useTranslations()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('extracted.queues.backfillsTable.backfills_a48b0e52')}</CardTitle>
      </CardHeader>
      <CardContent className='p-0'>
        <AdminTableShell
          aria-label={t('extracted.queues.backfillsTable.backfills_a48b0e52')}
          className='rounded-none border-0 shadow-none'
        >
          <table
            data-pw='backfills-table'
            className='w-full text-sm'
          >
            <thead>
              <tr className='border-b bg-muted/50'>
                <th
                  scope='col'
                  className='px-4 py-3 text-left font-medium text-muted-foreground'
                >
                  {t('extracted.queues.backfillsTable.queue_3b2fe03e')}
                </th>
                <th
                  scope='col'
                  className='px-4 py-3 text-left font-medium text-muted-foreground'
                >
                  {t('extracted.queues.backfillsTable.description_526e0087')}
                </th>
                <th
                  scope='col'
                  className='px-4 py-3 text-left font-medium text-muted-foreground'
                >
                  {t('extracted.queues.backfillsTable.sourceTable_59462672')}
                </th>
                <th
                  scope='col'
                  className='px-4 py-3 text-left font-medium text-muted-foreground'
                >
                  {t('extracted.queues.backfillsTable.action_64cff131')}
                </th>
              </tr>
            </thead>
            <tbody>
              {backfills.map(backfill => (
                <tr
                  key={backfill.id}
                  className='border-b last:border-0 hover:bg-muted/50'
                >
                  <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                    {backfill.queue_name}
                  </td>
                  <td className='px-4 py-3'>
                    <div className='font-medium'>{backfill.description}</div>
                    <div className='font-mono text-xs text-muted-foreground'>
                      {backfill.job_name}
                    </div>
                  </td>
                  <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                    {backfill.source_table}
                  </td>
                  <td className='px-4 py-3'>
                    <Button
                      variant='outline'
                      size='touchSm'
                      disabled={actionLoading[backfill.id]}
                      onClick={() => onPendingBackfillChange(backfill)}
                    >
                      {actionLoading[backfill.id] ? (
                        <span className='flex items-center gap-2'>
                          <Loader2 className='h-3 w-3 animate-spin' />
                          {t('extracted.queues.backfillsTable.running_4977a7e5')}
                        </span>
                      ) : (
                        t('extracted.queues.backfillsTable.runBackfill_625fd5e1')
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </CardContent>
    </Card>
  )
}
