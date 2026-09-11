'use client'

import { AlertCircle, Loader2 } from 'lucide-react'
import { useTranslations } from '@/lib/i18n/use-translations'

export function PostgreSQLLoadingState() {
  const t = useTranslations()
  return (
    <div className='flex items-center justify-center min-h-screen'>
      <h1 className='sr-only'>
        {t('extracted.postgresql.postgresqlLoadState.postgresql_cc52d032')}
      </h1>
      <div className='flex flex-col items-center gap-4'>
        <Loader2 className='animate-spin w-8 h-8 text-primary' />
        <p className='text-muted-foreground'>
          {t('extracted.postgresql.postgresqlLoadState.loadingPostgresqlStatus_81848c38')}
        </p>
      </div>
    </div>
  )
}

export function PostgreSQLErrorState({ error }: { error: string }) {
  const t = useTranslations()
  return (
    <div>
      <h1 className='sr-only'>
        {t('extracted.postgresql.postgresqlLoadState.postgresql_cc52d032')}
      </h1>
      <div className='flex items-center gap-4 p-4 bg-red-50 border border-red-200 rounded-lg'>
        <AlertCircle className='w-6 h-6 text-destructive flex-shrink-0' />
        <div>
          <h2 className='font-semibold text-red-900'>
            {t('extracted.postgresql.postgresqlLoadState.errorLoadingPostgresqlStatus_d28d817a')}
          </h2>
          <p className='text-red-700'>{error}</p>
        </div>
      </div>
    </div>
  )
}

export function PostgreSQLInlineError({ error }: { error: string }) {
  return (
    <div className='flex items-center gap-4 p-4 mb-6 bg-red-50 border border-red-200 rounded-lg'>
      <AlertCircle className='w-5 h-5 text-destructive flex-shrink-0' />
      <p className='text-red-700'>{error}</p>
    </div>
  )
}
