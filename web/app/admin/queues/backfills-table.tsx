'use client'

import type { ReactNode } from 'react'
import type { Backfill } from '@/lib/api/client/mq'
import { useTranslations } from '@/lib/i18n/use-translations'
import { QueueCatalogTable } from './queue-catalog-table'

function backfillLabels(t: ReturnType<typeof useTranslations>) {
  return {
    action: t('extracted.queues.backfillsTable.action_64cff131'),
    detail: t('extracted.queues.backfillsTable.sourceTable_59462672'),
    heading: t('extracted.queues.backfillsTable.backfills_a48b0e52'),
    idle: t('extracted.queues.backfillsTable.runBackfill_625fd5e1'),
    loading: t('extracted.queues.backfillsTable.running_4977a7e5'),
    middle: t('extracted.queues.backfillsTable.description_526e0087'),
    queue: t('extracted.queues.backfillsTable.queue_3b2fe03e'),
  }
}

function backfillCells(backfill: Backfill) {
  return {
    detail: backfill.source_table,
    queueName: backfill.queue_name,
    subtitle: backfill.job_name,
    title: backfill.description,
  }
}

function renderBackfillsTable(contents: ReactNode) {
  return (
    <table
      data-pw='backfills-table'
      className='w-full text-sm'
    >
      {contents}
    </table>
  )
}

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
    <QueueCatalogTable
      actionLoading={actionLoading}
      labels={backfillLabels(t)}
      onActivate={onPendingBackfillChange}
      renderTable={renderBackfillsTable}
      rows={backfills}
      toCells={backfillCells}
    />
  )
}
