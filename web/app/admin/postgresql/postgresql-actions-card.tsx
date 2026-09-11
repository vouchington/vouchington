'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  PARTITION_ACTION_LABELS,
  PARTITION_ACTION_TOOLTIPS,
  type PartitionAction,
  type PsqlAction,
} from './postgresql-state'
import { useTranslations } from '@/lib/i18n/use-translations'

const PARTITION_ACTIONS = ['createPartitions', 'cleanupPartitions'] as const

export function PostgreSQLActionsCard({
  actionLoading,
  onAction,
  setPendingAction,
}: {
  actionLoading: Record<string, boolean>
  onAction: (action: PsqlAction) => void
  setPendingAction: (action: PartitionAction) => void
}) {
  const t = useTranslations()
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
