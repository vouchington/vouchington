'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface FeedErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function FeedError({ error, reset }: FeedErrorProps) {
  const t = useTranslations()
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className='flex flex-col items-center gap-4 py-12 text-center'>
      <p className='text-muted-foreground'>
        {t('extracted.feed.error.somethingWentWrongLoadingYourFeed_41f0c3bb')}
      </p>
      <Button
        variant='outline'
        onClick={reset}
      >
        {t('extracted.feed.error.tryAgain_d8b8392e')}
      </Button>
    </div>
  )
}
