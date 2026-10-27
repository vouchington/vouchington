'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PARTITION_ACTION_LABELS,
  PARTITION_ACTION_TOOLTIPS,
  type ClassifierPartitionRange,
  type PartitionAction,
  type PsqlAction,
} from './postgresql-state'
import { useTranslations } from '@/lib/i18n/use-translations'

const PARTITION_ACTIONS = ['createPartitions', 'cleanupPartitions'] as const

export function PostgreSQLActionsCard({
  actionLoading,
  onAction,
  setPendingAction,
  setPendingClassifierAction,
}: {
  actionLoading: Record<string, boolean>
  onAction: (action: PsqlAction) => void
  setPendingAction: (action: PartitionAction) => void
  setPendingClassifierAction: (action: PartitionAction, range: ClassifierPartitionRange) => void
}) {
  const t = useTranslations()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [maxDefaultRows, setMaxDefaultRows] = useState(5000)
  const validRange =
    fromDate !== '' &&
    toDate !== '' &&
    fromDate < toDate &&
    Number.isSafeInteger(maxDefaultRows) &&
    maxDefaultRows >= 1 &&
    maxDefaultRows <= 5000
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('extracted.postgresql.postgresqlActionsCard.actions_ff8059dc')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='flex gap-3 flex-wrap'>
          <PsqlActionButton
            action='runMigrations'
            label='Run Migrations'
            loading={!!actionLoading.runMigrations}
            onAction={onAction}
            dataPw='postgresql-run-migrations'
          />
          <PsqlActionButton
            action='runViews'
            label='Run Views'
            loading={!!actionLoading.runViews}
            onAction={onAction}
            variant='outline'
            dataPw='postgresql-run-views'
          />
          <PsqlActionButton
            action='runConfigDriven'
            label='Run Config-Driven'
            loading={!!actionLoading.runConfigDriven}
            onAction={onAction}
            variant='outline'
            dataPw='postgresql-run-config-driven'
          />
          {PARTITION_ACTIONS.map(action => (
            <Tooltip key={action}>
              <TooltipTrigger asChild>
                <Button
                  variant='outline'
                  loading={actionLoading[action]}
                  disabled={actionLoading[action]}
                  onClick={() => setPendingAction(action)}
                >
                  {actionLoading[action] ? 'Running...' : PARTITION_ACTION_LABELS[action]}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{PARTITION_ACTION_TOOLTIPS[action]}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className='mt-6 space-y-3'>
          <p className='text-sm'>
            Classifier batch range (UTC). All three result DEFAULT children must fit this range; the
            operation reads at most 5,001 rows per table and seals at most 15,000 rows total.
          </p>
          <div className='flex flex-wrap gap-3'>
            <div>
              <Label htmlFor='classifier-partition-from'>From (inclusive)</Label>
              <Input
                id='classifier-partition-from'
                type='date'
                value={fromDate}
                onChange={event => setFromDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='classifier-partition-to'>To (exclusive)</Label>
              <Input
                id='classifier-partition-to'
                type='date'
                value={toDate}
                onChange={event => setToDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='classifier-partition-row-budget'>
                Rows per DEFAULT (maximum 5,000)
              </Label>
              <Input
                id='classifier-partition-row-budget'
                type='number'
                min={1}
                max={5000}
                value={maxDefaultRows}
                onChange={event => setMaxDefaultRows(Number(event.target.value))}
              />
            </div>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Button
              variant='outline'
              disabled={!validRange || actionLoading.createPartitions}
              onClick={() =>
                setPendingClassifierAction('createPartitions', { fromDate, toDate, maxDefaultRows })
              }
            >
              Create Classifier Range
            </Button>
            <Button
              variant='outline'
              disabled={!validRange || actionLoading.cleanupPartitions}
              onClick={() => setPendingClassifierAction('cleanupPartitions', { fromDate, toDate })}
            >
              Retire Classifier Range
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PsqlActionButton({
  action,
  label,
  loading,
  onAction,
  variant,
  dataPw = '',
}: {
  action: PsqlAction
  label: string
  loading: boolean
  onAction: (action: PsqlAction) => void
  variant?: 'outline'
  dataPw?: string
}) {
  return (
    <Button
      variant={variant}
      loading={loading}
      disabled={loading}
      onClick={() => onAction(action)}
      {...(dataPw && { 'data-pw': dataPw })}
    >
      {loading ? 'Running...' : label}
    </Button>
  )
}
