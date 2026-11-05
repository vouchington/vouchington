'use client'

import { useId } from 'react'

import { useTranslations } from '@/lib/i18n/use-translations'
import { Progress } from '@/components/ui/progress'
import type { ImportProgress } from '@/lib/api/client/import-stream'

interface Props {
  progress: ImportProgress
}

export function ImportProgressBar({ progress }: Props) {
  const t = useTranslations()
  const labelId = useId()
  const pct =
    progress.total > 0
      ? Math.round(
          ((progress.completed + progress.failed + progress.skipped) / progress.total) * 100,
        )
      : 0
  const label = progress.done
    ? t('shared.relationLimit.importResult', {
        completed: progress.completed,
        failed: progress.failed,
        skipped: progress.skipped,
      })
    : `Processing… ${progress.completed + progress.failed + progress.skipped} / ${progress.total}`

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
        {progress.skipped > 0
          ? ` ${t('shared.relationLimit.importSkipped', { count: progress.skipped })}`
          : null}
      </p>
    </div>
  )
}
