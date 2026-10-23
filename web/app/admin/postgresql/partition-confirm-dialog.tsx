'use client'

import { useEffect, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  PARTITION_ACTION_DESCRIPTIONS,
  PARTITION_ACTION_LABELS,
  type ClassifierPartitionRange,
  type PartitionAction,
} from './postgresql-state'
import { useTranslations } from '@/lib/i18n/use-translations'
import { fetchPartitions } from '@/lib/api/client/psql'
import type { PartitionInfo, PartitionStatusResponseBody } from '@/types/api-responses'

const DROP_REASON_LABELS: Record<NonNullable<PartitionInfo['drop_refusal']>, string> = {
  'no-declared-retention': 'no minimum retention window is declared',
  'inside-retention': 'the partition is still inside its retention window',
  'legal-hold': 'rows are covered by an open legal hold',
  'in-flight': 'rows still have unfinished work',
  'check-pending': 'the backend will check this partition during cleanup',
}

export function PartitionConfirmDialog({
  confirmPartitionAction,
  pendingAction,
  pendingClassifierRange,
  setPendingAction,
}: {
  confirmPartitionAction: () => void
  pendingAction: PartitionAction | null
  pendingClassifierRange: ClassifierPartitionRange | null
  setPendingAction: (action: PartitionAction | null) => void
}) {
  const t = useTranslations()
  const [partitionStatus, setPartitionStatus] = useState<PartitionStatusResponseBody | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  useEffect(() => {
    if (pendingAction !== 'cleanupPartitions') return
    let active = true
    void fetchPartitions().then(
      status => {
        if (active) setPartitionStatus(status)
      },
      err => {
        if (active)
          setStatusError(err instanceof Error ? err.message : 'Could not load partition status')
      },
    )
    return () => {
      active = false
    }
  }, [pendingAction])

  const classifierSuffix = pendingClassifierRange
    ? `__r_${pendingClassifierRange.fromDate.replaceAll('-', '')}_${pendingClassifierRange.toDate.replaceAll('-', '')}`
    : null
  const refusals =
    partitionStatus?.tables.flatMap(table =>
      table.partitions.flatMap(partition =>
        partition.drop_refusal && (!classifierSuffix || partition.name.endsWith(classifierSuffix))
          ? [{ table: table.name, partition: partition.name, reason: partition.drop_refusal }]
          : [],
      ),
    ) ?? []
  return (
    <AlertDialog
      open={pendingAction !== null}
      onOpenChange={(open: boolean) => {
        if (!open) {
          setPartitionStatus(null)
          setStatusError(null)
          setPendingAction(null)
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingClassifierRange
              ? pendingAction === 'createPartitions'
                ? 'Create Classifier Range'
                : 'Retire Classifier Range'
              : pendingAction
                ? PARTITION_ACTION_LABELS[pendingAction]
                : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingClassifierRange
              ? `${pendingAction === 'createPartitions' ? 'Seal' : 'Permanently retire'} the three classifier result partitions for ${pendingClassifierRange.fromDate} to ${pendingClassifierRange.toDate} (exclusive). The worker checks row bounds, foreign keys, pending work, and retention before committing.`
              : pendingAction
                ? PARTITION_ACTION_DESCRIPTIONS[pendingAction]
                : ''}
          </AlertDialogDescription>
          {pendingAction === 'cleanupPartitions' && statusError && (
            <p role='alert'>Partition status unavailable: {statusError}</p>
          )}
          {pendingAction === 'cleanupPartitions' && !partitionStatus && !statusError && (
            <p>Checking partition eligibility…</p>
          )}
          {pendingAction === 'cleanupPartitions' && refusals.length > 0 && (
            <div className='max-h-48 overflow-y-auto text-sm'>
              <p>Partitions the backend currently refuses to drop:</p>
              <ul className='list-disc pl-5'>
                {refusals.map(item => (
                  <li key={item.partition}>
                    <code>
                      {item.table}.{item.partition}
                    </code>
                    : {DROP_REASON_LABELS[item.reason]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t('extracted.postgresql.partitionConfirmDialog.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pendingAction === 'cleanupPartitions' && !partitionStatus}
            onClick={confirmPartitionAction}
          >
            {t('extracted.postgresql.partitionConfirmDialog.confirm_eebdd24a')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
