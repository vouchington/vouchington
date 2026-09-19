export const dynamic = 'force-dynamic'

import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import './globals.css'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { headers } from 'next/headers'
import { THEME_INIT_SCRIPT } from '@/lib/preferences/theme-script'
import { GtmConsentLoader } from '@/lib/gtm/gtm-consent-loader'
import { getValidGtmId } from '@/lib/gtm/gtm-id'
import { CookieConsentBanner } from '@/components/cookie-consent-banner'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import * as Sentry from '@sentry/nextjs'
import { createRootMetadata } from '@/lib/seo/metadata'
import { StructuredDataScript } from '@/components/seo/structured-data-script'
import { ResourceHints } from '@/components/seo/resource-hints'
import { SpeculationRulesScript } from '@/components/seo/speculation-rules-script'
import { PUBLIC_NAV_ITEMS } from '@/lib/navigation/public-nav'
import { createSiteNavigationSchema } from '@/lib/seo/structured-data'
import { shouldRenderSiteNavigationSchema } from '@/lib/seo/site-navigation-routes'
import { ScrollToTop } from '@/components/scroll-to-top'
import { serializeImageOriginBootstrapScript } from '@/lib/utils/image-origin-bootstrap'
import { getServerImageOrigin } from '@/lib/utils/image-origin'
import { serializeUiMessagesBootstrapScript } from '@/lib/utils/ui-messages-bootstrap'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { UiMessagesHydrator } from '@/lib/i18n/ui-messages-hydrator'
import {
  assertRuntimePublicConfig,
  getServerRuntimePublicConfig,
  serializeRuntimePublicConfigBootstrapScript,
} from '@/lib/runtime-public-config-server'
import { serializeCatalog } from '@ts-shared/ui-messages/catalog-bootstrap'
import { RootAppShell } from './root-app-shell'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getGlobalServerFeatureFlags } from '@/lib/feature-flags/server'
import {
  loadServerMessages,
  ssrLocalizationRevisionHtmlProps,
} from '@/lib/i18n/load-server-messages'

export async function generateMetadata(): Promise<Metadata> {
  // A cache-fill render's HTML is frozen into the shared anon edge cache and replayed to every
  // later visitor (see cloudflare-worker's origin-request.mts and nonce-rewrite.mts) — trace meta
  // baked in here would misattribute every one of those replays to this one origin request, so
  // this is the only render that must omit it. Every other render (bypass, authenticated, RSC) is
  // per-request and keeps emitting trace meta.
  const requestKind = (await headers()).get('x-voucha-request-kind')
  return {
    ...createRootMetadata(),
    // Include Sentry trace data for distributed tracing
    other: {
      ...(requestKind === 'cache-fill' ? {} : Sentry.getTraceData()),
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#b8860b',
  colorScheme: 'light dark',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // uiLocale comes only from getResolvedUiLocale() so this file cannot drift.
  const t = await getTranslations()
  const [user, headersList, uiLocale, globalFeatureFlags] = await Promise.all([
    getCurrentUser(),
    headers(),
    getResolvedUiLocale(),
    getGlobalServerFeatureFlags(),
  ])
  const nonce = headersList.get('x-nonce') ?? undefined
  const runtimePublicConfig = getServerRuntimePublicConfig(process.env, {
    allowTurnstileTestKey: process.env.ALLOW_TURNSTILE_TEST_KEY === 'true',
  })
  assertRuntimePublicConfig(runtimePublicConfig)
  const runtimePublicConfigScript = serializeRuntimePublicConfigBootstrapScript(runtimePublicConfig)
  const gtmId = getValidGtmId(runtimePublicConfig.gtmId)
  const assetPrefix = process.env.NEXT_PUBLIC_ASSET_PREFIX
  // Mirror the runtime IMAGE_ORIGIN env var onto window for client-side
  // getImageUrl() callers. Kept out of NEXT_PUBLIC_ on purpose so the same
  // Docker image can deploy to staging and production with different values.
  const imageOrigin = getServerImageOrigin()
  const imageOriginScript = serializeImageOriginBootstrapScript(imageOrigin)
  // Catalog leaves are strings or data-only plural descriptors, so a route batch can seed the client cache.
  const uiMessages = await loadServerMessages(uiLocale)
  const uiMessagesScript = serializeUiMessagesBootstrapScript({
    locale: uiLocale,
    catalog: serializeCatalog(uiMessages),
  })
  const pathname = headersList.get('x-pathname')
  const safePathname = pathname ?? ''
  const isStandaloneLandingPage = /^\/@[^/]+(?:\/[^/]+)?\/?$/.test(safePathname)

  const mainClassName =
    'min-w-0 flex-1 px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4'

  const mainContent = (
    <main
      id='main-content'
      tabIndex={-1}
      className={mainClassName}
    >
      {children}
    </main>
  )

  return (
    <html
      lang={uiLocale}
      suppressHydrationWarning
      {...ssrLocalizationRevisionHtmlProps(uiMessages)}
    >
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <ResourceHints
          assetPrefix={assetPrefix}
          imageOrigin={imageOrigin}
        />
        {/* oxlint-disable react/no-danger -- theme script is static; runtime bootstrap values are HTML/script-context escaped */}
        <script
          id='theme-init'
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {imageOriginScript ? (
          <script
            id='image-origin-init'
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: imageOriginScript }}
          />
        ) : null}
        {/* eslint-disable-next-line no-mistakes/nextjs-no-manual-script-tags -- exempt inline init script */}
        <script
          id='runtime-public-config-init'
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: runtimePublicConfigScript }}
        />
        {/* eslint-disable-next-line no-mistakes/nextjs-no-manual-script-tags -- exempt inline init script */}
        <script
          id='ui-messages-init'
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: uiMessagesScript }}
        />
        {/* oxlint-enable react/no-danger */}
        <a
          href='#main-content'
          data-pw='skip-to-main-link'
          className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring'
        >
          {t('extracted.app.layout.skipToMainContent_c887f134')}
        </a>
        {!user && shouldRenderSiteNavigationSchema(safePathname) ? (
          <StructuredDataScript
            data={createSiteNavigationSchema(
              PUBLIC_NAV_ITEMS.map(item => ({ name: t(item.label), path: item.href })),
            )}
            nonce={nonce}
          />
        ) : null}
        {!user ? <SpeculationRulesScript nonce={nonce} /> : null}
        <GtmConsentLoader
          gtmId={gtmId}
          nonce={nonce}
        />
        <UiMessagesHydrator
          locale={uiLocale}
          catalog={uiMessages}
        >
          <UiLocaleProvider uiLocale={uiLocale}>
            <CookieConsentBanner />
          </UiLocaleProvider>
        </UiMessagesHydrator>
        <ServiceWorkerRegistrar currentUserId={user?.id} />
        <ScrollToTop />
        {/* Siblings above render outside RuntimePublicConfigProvider; config consumers belong in RootAppShell. */}
        <RootAppShell
          currentUser={user}
          globalFeatureFlags={globalFeatureFlags}
          isStandaloneLandingPage={isStandaloneLandingPage}
          initialPathname={pathname ?? '/'}
          mainContent={mainContent}
          runtimePublicConfig={runtimePublicConfig}
          uiLocale={uiLocale}
          uiMessages={uiMessages}
        />
      </body>
    </html>
  )
}
