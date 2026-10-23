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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ExplicitPartitionRange } from '@/lib/api/client/psql'
import {
  PARTITION_ACTION_DESCRIPTIONS,
  PARTITION_ACTION_LABELS,
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

const UUIDV7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

function isReadyRange(range: ExplicitPartitionRange): boolean {
  return (
    /^[a-z][a-z0-9_]*$/u.test(range.table) &&
    UUIDV7_PATTERN.test(range.fromId) &&
    UUIDV7_PATTERN.test(range.toId) &&
    range.fromId < range.toId &&
    Number.isInteger(range.maxRows) &&
    range.maxRows >= 1 &&
    range.maxRows <= 10_000
  )
}

export function PartitionConfirmDialog({
  confirmPartitionAction,
  pendingAction,
  partitionRange,
  setPartitionRange,
  setPendingAction,
}: {
  confirmPartitionAction: () => void
  pendingAction: PartitionAction | null
  partitionRange: ExplicitPartitionRange
  setPartitionRange: (range: ExplicitPartitionRange) => void
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

  const refusals =
    partitionStatus?.tables.flatMap(table =>
      table.partitions.flatMap(partition =>
        partition.drop_refusal
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
            {pendingAction ? PARTITION_ACTION_LABELS[pendingAction] : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingAction ? PARTITION_ACTION_DESCRIPTIONS[pendingAction] : ''}
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
        {pendingAction === 'createPartitions' && (
          <div className='grid gap-3'>
            <Label htmlFor='partition-table'>Table</Label>
            <Input
              id='partition-table'
              value={partitionRange.table}
              onChange={event =>
                setPartitionRange({ ...partitionRange, table: event.target.value })
              }
            />
            <Label htmlFor='partition-from-id'>From UUIDv7 (inclusive)</Label>
            <Input
              id='partition-from-id'
              value={partitionRange.fromId}
              onChange={event =>
                setPartitionRange({ ...partitionRange, fromId: event.target.value })
              }
            />
            <Label htmlFor='partition-to-id'>To UUIDv7 (exclusive)</Label>
            <Input
              id='partition-to-id'
              value={partitionRange.toId}
              onChange={event => setPartitionRange({ ...partitionRange, toId: event.target.value })}
            />
            <Label htmlFor='partition-max-rows'>Maximum rows to move</Label>
            <Input
              id='partition-max-rows'
              type='number'
              min={1}
              max={10_000}
              value={partitionRange.maxRows}
              onChange={event =>
                setPartitionRange({ ...partitionRange, maxRows: Number(event.target.value) })
              }
            />
            <p className='text-sm text-muted-foreground'>
              Use lowercase UUIDv7 bounds, with From before To.
            </p>
            <p className='text-sm text-muted-foreground'>
              The action stops if the range exceeds this limit, the DEFAULT partition exceeds
              100,000 rows, or a referencing table exceeds 100,000 rows.
            </p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t('extracted.postgresql.partitionConfirmDialog.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmPartitionAction}
            disabled={
              (pendingAction === 'cleanupPartitions' && !partitionStatus) ||
              (pendingAction === 'createPartitions' && !isReadyRange(partitionRange))
            }
          >
            {t('extracted.postgresql.partitionConfirmDialog.confirm_eebdd24a')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
