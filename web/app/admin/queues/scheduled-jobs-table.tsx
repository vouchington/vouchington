'use client'

import type { ReactNode } from 'react'
import type { ScheduledJob } from '@/lib/api/client/mq'
import { useTranslations } from '@/lib/i18n/use-translations'
import { QueueCatalogTable } from './queue-catalog-table'

function scheduledJobLabels(t: ReturnType<typeof useTranslations>) {
  return {
    action: t('extracted.queues.scheduledJobsTable.action_64cff131'),
    detail: t('extracted.queues.scheduledJobsTable.schedule_f4830a1d'),
    heading: t('extracted.queues.scheduledJobsTable.scheduledJobs_63df3f1d'),
    idle: t('extracted.queues.scheduledJobsTable.trigger_8b9c6437'),
    loading: t('extracted.queues.scheduledJobsTable.triggering_b7f2a98c'),
    middle: t('extracted.queues.scheduledJobsTable.job_ad617a0f'),
    queue: t('extracted.queues.scheduledJobsTable.queue_3b2fe03e'),
  }
}

function scheduledJobCells(job: ScheduledJob) {
  return {
    detail: job.schedule,
    queueName: job.queue_name,
    subtitle: job.job_name,
    title: job.description,
  }
}

function renderScheduledJobsTable(contents: ReactNode) {
  return (
    <table
      data-pw='scheduled-jobs-table'
      className='w-full text-sm'
    >
      {contents}
    </table>
  )
}

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
    <QueueCatalogTable
      actionLoading={actionLoading}
      labels={scheduledJobLabels(t)}
      onActivate={onPendingJobChange}
      renderTable={renderScheduledJobsTable}
      rows={jobs}
      toCells={scheduledJobCells}
    />
  )
}
