'use client'

import Link from 'next/link'
import { Home, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '@ts-shared/languages/ui-locales'
import { parseErrorDigest } from '@/lib/api/error-helpers'
import { invalidateRouteMessages } from '@/lib/i18n/route-messages-cache'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { invalidateMessages, useTranslations } from '@/lib/i18n/use-translations'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations()
  const locale = normalizeUiLocale(useUiLocale()) ?? DEFAULT_UI_LOCALE
  const parsed = parseErrorDigest(error.digest)
  const status = parsed?.status ?? 500
  const title = parsed ? t(parsed.title) : t('extracted.app.error.somethingWentWrong_ab827e3f')
  const description = parsed
    ? t(parsed.description)
    : t('extracted.app.error.somethingWentSidewaysOnOurEnd_407c3ad7')

  function retry(): void {
    invalidateMessages(locale)
    invalidateRouteMessages(locale, window.location.pathname)
    reset()
  }

  return (
    <div
      className='flex min-h-[50vh] flex-col items-center justify-center py-16 text-center'
      data-pw='error-page'
    >
      <p className='text-6xl font-bold text-muted-foreground'>{status}</p>
      <h1
        className='mt-4 text-2xl font-semibold'
        data-pw='error-page-title'
      >
        {title}
      </h1>
      <p
        className='mt-2 max-w-sm text-sm text-muted-foreground'
        data-pw='error-page-description'
      >
        {description}
      </p>
      <div className='mt-8 flex flex-wrap justify-center gap-3'>
        <Button
          className='min-h-11'
          onClick={retry}
          data-pw='error-page-retry-button'
        >
          <RotateCcw className='h-4 w-4' />
          {t('extracted.app.error.tryAgain_d8b8392e')}
        </Button>
        <Button
          asChild
          variant='outline'
          className='min-h-11'
        >
          <Link
            href='/'
            prefetch={false}
            data-pw='error-page-home-link'
          >
            <Home className='h-4 w-4' />
            {t('extracted.app.error.home_3a786953')}
          </Link>
        </Button>
      </div>
    </div>
  )
}
