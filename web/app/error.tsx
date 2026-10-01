'use client'

import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '@ts-shared/languages/ui-locales'
import { AppErrorPanel } from '@/components/shared/app-error-panel'
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
    <AppErrorPanel
      status={status}
      title={title}
      description={description}
      retryLabel={t('extracted.app.error.tryAgain_d8b8392e')}
      homeLabel={t('extracted.app.error.home_3a786953')}
      onRetry={retry}
      variant='route'
      dataPw={{
        root: 'error-page',
        title: 'error-page-title',
        description: 'error-page-description',
        retry: 'error-page-retry-button',
        home: 'error-page-home-link',
      }}
    />
  )
}
