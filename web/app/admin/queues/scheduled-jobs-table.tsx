'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import type { ScheduledJob } from '@/lib/api/client/mq'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ScheduledJobsTable({
  actionLoading,
  jobs,
  onPendingJobChange,
}: {
  actionLoading: Record<string, boolean>
  jobs: ScheduledJob[]
  onPendingJobChange: (job: ScheduledJob) => void
}) {
  const t = useTranslations()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('extracted.queues.scheduledJobsTable.scheduledJobs_63df3f1d')}</CardTitle>
      </CardHeader>
      <CardContent className='p-0'>
        <AdminTableShell
          aria-label={t('extracted.queues.scheduledJobsTable.scheduledJobs_63df3f1d')}
          className='rounded-none border-0 shadow-none'
        >
          <table
            data-pw='scheduled-jobs-table'
            className='w-full text-sm'
          >
            <thead>
              <tr className='border-b bg-muted/50'>
                <th
                  scope='col'
                  className='px-4 py-3 text-left font-medium text-muted-foreground'
                >
                  {t('extracted.queues.scheduledJobsTable.queue_3b2fe03e')}
                </th>
                <th
                  scope='col'
                  className='px-4 py-3 text-left font-medium text-muted-foreground'
                >
                  {t('extracted.queues.scheduledJobsTable.job_ad617a0f')}
                </th>
                <th
                  scope='col'
                  className='px-4 py-3 text-left font-medium text-muted-foreground'
                >
                  {t('extracted.queues.scheduledJobsTable.schedule_f4830a1d')}
                </th>
                <th
                  scope='col'
                  className='px-4 py-3 text-left font-medium text-muted-foreground'
                >
                  {t('extracted.queues.scheduledJobsTable.action_64cff131')}
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr
                  key={job.id}
                  className='border-b last:border-0 hover:bg-muted/50'
                >
                  <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                    {job.queue_name}
                  </td>
                  <td className='px-4 py-3'>
                    <div className='font-medium'>{job.description}</div>
                    <div className='font-mono text-xs text-muted-foreground'>{job.job_name}</div>
                  </td>
                  <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                    {job.schedule}
                  </td>
                  <td className='px-4 py-3'>
                    <Button
                      variant='outline'
                      size='touchSm'
                      disabled={actionLoading[job.id]}
                      onClick={() => onPendingJobChange(job)}
                    >
                      {actionLoading[job.id] ? (
                        <span className='flex items-center gap-2'>
                          <Loader2 className='h-3 w-3 animate-spin' />
                          {t('extracted.queues.scheduledJobsTable.triggering_b7f2a98c')}
                        </span>
                      ) : (
                        t('extracted.queues.scheduledJobsTable.trigger_8b9c6437')
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
