'use client'

import { Suspense, useSyncExternalStore } from 'react'
import './globals.css'
import Script from 'next/script'
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '@ts-shared/languages/ui-locales'
import { AppErrorPanel } from '@/components/shared/app-error-panel'
import { parseErrorDigest } from '@/lib/api/error-helpers'
import { invalidateRouteMessages } from '@/lib/i18n/route-messages-cache'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { invalidateMessages, useTranslations } from '@/lib/i18n/use-translations'

function getBootstrapLocale(): string {
  if (typeof window === 'undefined') return DEFAULT_UI_LOCALE
  // eslint-disable-next-line no-underscore-dangle -- HTML bootstrap namespace from layout.tsx.
  return normalizeUiLocale(window.__UI_MESSAGES__?.locale) ?? DEFAULT_UI_LOCALE
}

function subscribeBootstrapLocale(): () => void {
  // The bootstrap is written once before the client bundle executes.
  return () => {}
}

function getServerLocale(): string {
  return DEFAULT_UI_LOCALE
}

function GlobalErrorBody({
  error,
  locale,
  reset,
}: {
  error: Error & { digest?: string }
  locale: string
  reset: () => void
}) {
  const t = useTranslations()
  const parsed = parseErrorDigest(error.digest)
  const status = parsed?.status ?? 500
  const title = parsed
    ? t(parsed.title)
    : t('extracted.app.globalError.somethingWentWrong_ab827e3f')
  const description = parsed
    ? t(parsed.description)
    : t('extracted.app.globalError.somethingWentSidewaysOnOurEnd_407c3ad7')

  function retry(): void {
    // Root-layout route loads are above app/error.tsx, so this boundary handles their failures.
    invalidateMessages(locale)
    invalidateRouteMessages(locale, window.location.pathname)
    reset()
  }

  return (
    <AppErrorPanel
      status={status}
      title={title}
      description={description}
      retryLabel={t('extracted.app.globalError.tryAgain_d8b8392e')}
      homeLabel={t('extracted.app.globalError.goHome_a0aac914')}
      onRetry={retry}
      variant='global'
      dataPw={{
        root: 'global-error-page',
        title: 'global-error-page-title',
        description: 'global-error-page-description',
        retry: 'global-error-page-retry-button',
        home: 'global-error-page-home-link',
      }}
    />
  )
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = useSyncExternalStore(subscribeBootstrapLocale, getBootstrapLocale, getServerLocale)
  return (
    <html lang={locale}>
      <body className='bg-background text-foreground antialiased'>
        {/* This document replaces RootLayout, so it must load the same runtime config bootstrap
            that wakes Sentry's readiness listener after the standalone error page hydrates. */}
        <Script
          id='runtime-public-config-init'
          src='/runtime-sentry-config.js'
          strategy='afterInteractive'
        />
        <UiLocaleProvider uiLocale={locale}>
          <Suspense fallback={null}>
            <GlobalErrorBody
              error={error}
              locale={locale}
              reset={reset}
            />
          </Suspense>
        </UiLocaleProvider>
      </body>
    </html>
  )
}
