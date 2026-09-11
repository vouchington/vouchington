'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SettingsErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function SettingsError({ error, reset }: SettingsErrorProps) {
  const t = useTranslations()
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className='flex flex-col items-center gap-4 py-12 text-center'>
      <p className='text-muted-foreground'>
        {t('extracted.my.error.somethingWentWrongLoadingThisPage_476320a5')}
      </p>
      <Button
        variant='outline'
        onClick={reset}
      >
        {t('extracted.my.error.tryAgain_d8b8392e')}
      </Button>
    </div>
  )
}
