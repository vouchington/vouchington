'use client'

import './globals.css'
import Link from 'next/link'
import { parseErrorDigest } from '@/lib/api/error-helpers'
import { Button } from '@/components/ui/button'
import { defaultTranslator as t } from '@ts-shared/ui-messages/default-translator'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const parsed = parseErrorDigest(error.digest)
  const status = parsed?.status ?? 500
  const title = parsed
    ? t(parsed.title)
    : t('extracted.app.globalError.somethingWentWrong_ab827e3f')
  const description = parsed
    ? t(parsed.description)
    : t('extracted.app.globalError.somethingWentSidewaysOnOurEnd_407c3ad7')

  return (
    <html lang='en'>
      <body className='bg-background text-foreground antialiased'>
        <div
          className='flex min-h-svh flex-col items-center justify-center py-16 text-center'
          data-pw='global-error-page'
        >
          <p className='text-6xl font-bold text-muted-foreground'>{status}</p>
          <h1
            className='mt-4 text-2xl font-semibold'
            data-pw='global-error-page-title'
          >
            {title}
          </h1>
          <p
            className='mt-2 max-w-sm text-sm text-muted-foreground'
            data-pw='global-error-page-description'
          >
            {description}
          </p>
          <div className='mt-8 flex flex-wrap justify-center gap-3'>
            <Button
              className='min-h-11'
              onClick={reset}
              data-pw='global-error-page-retry-button'
            >
              {t('extracted.app.globalError.tryAgain_d8b8392e')}
            </Button>
            <Button
              asChild
              variant='outline'
              className='min-h-11'
            >
              <Link
                href='/'
                prefetch={false}
                data-pw='global-error-page-home-link'
              >
                {t('extracted.app.globalError.goHome_a0aac914')}
              </Link>
            </Button>
          </div>
        </div>
      </body>
    </html>
  )
}
