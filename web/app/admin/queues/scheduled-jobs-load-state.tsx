'use client'

import { AlertCircle, Loader2 } from 'lucide-react'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ScheduledJobsLoadingState() {
  const t = useTranslations()
  return (
    <div className='flex min-h-screen items-center justify-center'>
      <h1 className='sr-only'>{t('extracted.queues.scheduledJobsLoadState.queues_be77db11')}</h1>
      <div className='flex flex-col items-center gap-4'>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
        <p className='text-muted-foreground'>
          {t('extracted.queues.scheduledJobsLoadState.loadingScheduledJobs_22dbad5e')}
        </p>
      </div>
    </div>
  )
}

export function ScheduledJobsErrorAlert({ error, title }: { error: string; title?: string }) {
  return (
    <div
      className='flex items-center gap-4 rounded-lg border border-red-200 bg-red-50 p-4'
      role='alert'
      aria-live='polite'
    >
      <AlertCircle className='h-6 w-6 flex-shrink-0 text-destructive' />
      <div>
        {title && <h2 className='font-semibold text-red-900'>{title}</h2>}
        <p className='text-red-700'>{error}</p>
      </div>
    </div>
  )
}

export function ScheduledJobsErrorState({ error }: { error: string }) {
  const t = useTranslations()
  return (
    <div className='flex min-h-screen items-center justify-center'>
      <h1 className='sr-only'>{t('extracted.queues.scheduledJobsLoadState.queues_be77db11')}</h1>
      <div className='w-full max-w-4xl'>
        <ScheduledJobsErrorAlert
          error={error}
          title={t('extracted.queues.scheduledJobsLoadState.errorLoadingScheduledJobs_4c9bba2c')}
        />
      </div>
    </div>
  )
}
