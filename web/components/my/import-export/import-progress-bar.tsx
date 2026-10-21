'use client'

import { useId } from 'react'

import { Progress } from '@/components/ui/progress'
import type { ImportProgress } from '@/lib/api/client/import-stream'

interface Props {
  progress: ImportProgress
}

export function ImportProgressBar({ progress }: Props) {
  const labelId = useId()
  const pct =
    progress.total > 0
      ? Math.round(((progress.completed + progress.failed) / progress.total) * 100)
      : 0
  const label = progress.done
    ? `Done — ${progress.completed} imported, ${progress.failed} failed`
    : `Processing… ${progress.completed + progress.failed} / ${progress.total}`

  return (
    <div
      className='space-y-2'
      data-pw='import-progress'
    >
      <Progress
        value={pct}
        aria-labelledby={labelId}
      />
      <p
        id={labelId}
        className='text-sm text-muted-foreground'
      >
        {label}
      </p>
    </div>
  )
}
