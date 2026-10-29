'use client'
import { Button } from '@/components/ui/button'
import type { PsqlAction } from './postgresql-state'

export function PsqlActionButton({
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
