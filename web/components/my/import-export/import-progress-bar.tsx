'use client'

import type { ImportProgress } from '@/lib/api/client/import-stream'

interface Props {
  progress: ImportProgress
}

export function ImportProgressBar({ progress }: Props) {
  const pct =
    progress.total > 0
      ? Math.round(((progress.completed + progress.failed) / progress.total) * 100)
      : 0

  return (
    <div
      className='space-y-2'
      data-pw='import-progress'
    >
      <div className='h-2 w-full overflow-hidden rounded-full bg-secondary'>
        <div
          className='h-full bg-primary transition-all duration-300'
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className='text-sm text-muted-foreground'>
        {progress.done
          ? `Done — ${progress.completed} imported, ${progress.failed} failed`
          : `Processing… ${progress.completed + progress.failed} / ${progress.total}`}
      </p>
    </div>
  )
}
