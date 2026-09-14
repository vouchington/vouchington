'use client'

import { Suspense, use, useSyncExternalStore, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '@ts-shared/languages/ui-locales'
import type { EnCatalog } from '@ts-shared/ui-messages'
import { mergeMessages } from './use-translations'
import { getRouteMessagesPromise } from './route-messages-cache'
import { useUiLocale } from './ui-locale-context'

function RouteMessages({
  children,
  initialCatalog,
  initialLocale,
  initialPathname,
  locale,
  pathname,
  shouldLoadDestination,
}: {
  children: ReactNode
  initialCatalog: EnCatalog
  initialLocale: string
  initialPathname: string
  locale: string
  pathname: string
  shouldLoadDestination: boolean
}) {
  const catalog = shouldLoadDestination
    ? use(getRouteMessagesPromise(locale, pathname))
    : initialCatalog
  mergeMessages(locale, catalog)
  return children
}

function subscribeAfterHydration(onStoreChange: () => void): () => void {
  queueMicrotask(onStoreChange)
  return () => {}
}

function isHydratedClient(): boolean {
  return true
}

function isServerRendering(): boolean {
  return false
}

/**
 * Holds route content until the destination's bounded backend catalog is ready. Root layouts
 * persist through client navigation, so their initial SSR catalog cannot supply destination-only
 * `extracted.*` copy. Chrome remains rendered while this boundary waits for that one request.
 */
export function LocalizedRouteBoundary({
  children,
  initialCatalog,
  initialLocale,
  initialPathname,
}: {
  children: ReactNode
  initialCatalog: EnCatalog
  initialLocale: string
  initialPathname: string
}) {
  const pathname = usePathname()
  const locale = normalizeUiLocale(useUiLocale()) ?? DEFAULT_UI_LOCALE
  const isInitialRender = !useSyncExternalStore(
    subscribeAfterHydration,
    isHydratedClient,
    isServerRendering,
  )
  const shouldLoadDestination =
    !isInitialRender && (locale !== initialLocale || pathname !== initialPathname)
  // `usePathname()` is a client-navigation value. Keep the server and hydration renders on the
  // catalog passed through the RSC boundary, then begin destination loading after hydration.
  // The initial tree must also stay outside Suspense: a server component can still throw
  // `redirect()` or `notFound()` while React is rendering it, and a parent Suspense boundary
  // would stream its fallback with a 200 status before Next can turn that outcome into a redirect
  // or 404 response.
  const routeMessages = (
    <RouteMessages
      initialCatalog={initialCatalog}
      initialLocale={initialLocale}
      initialPathname={initialPathname}
      locale={locale}
      pathname={pathname}
      shouldLoadDestination={shouldLoadDestination}
    >
      {children}
    </RouteMessages>
  )

  if (!shouldLoadDestination) return routeMessages

  return (
    <Suspense
      key={`${locale}\u0000${pathname}`}
      fallback={null}
    >
      {routeMessages}
    </Suspense>
  )
}
