import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import type { User } from '@/types/user'
import RootLayout from './layout'
import { SpeculationRulesScript } from '@/components/seo/speculation-rules-script'
import { RootAppShell } from './root-app-shell'

vi.mock(import('@/lib/i18n/load-server-messages'), () => ({
  loadServerMessages: loadJsonMessages,
  ssrLocalizationRevisionHtmlProps: () => ({}),
}))

interface HeaderBag {
  get: (key: string) => string | null
}

type CookieBag = { get: (key: string) => { value: string } | undefined }
type ReactModule = typeof import('react')
type MonoFontModule = typeof import('geist/font/mono')
type SansFontModule = typeof import('geist/font/sans')
type SidebarModule = typeof import('@/components/ui/sidebar')
type HeadersModule = typeof import('next/headers')
type AuthProviderModule = typeof import('@/lib/auth/auth-provider')
type ThemeContextModule = typeof import('@/lib/preferences/theme-context')
type ListStyleContextModule = typeof import('@/lib/preferences/list-style-context')
type FeedStyleContextModule = typeof import('@/lib/preferences/feed-style-context')
type ThemeScriptModule = typeof import('@/lib/preferences/theme-script')
type SonnerModule = typeof import('sonner')
type AsideProviderModule = typeof import('@/lib/aside-provider')
type VoteStoreProviderModule = typeof import('@/lib/votes/vote-store-provider')
type SpeculationRulesScriptModule = typeof import('@/components/seo/speculation-rules-script')

const getCurrentUserMock = vi.hoisted(() => vi.fn<() => Promise<User | null>>())
const headersMock = vi.hoisted(() => vi.fn<() => Promise<HeaderBag>>())
const cookiesMock = vi.hoisted(() => vi.fn<() => Promise<CookieBag>>())
const redirectMock = vi.hoisted(() => vi.fn<(path: string) => never>())

vi.mock<ReactModule>(import('react'), async importOriginal => {
  const actual = await importOriginal<ReactModule>()
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  } as unknown as ReactModule
})
vi.mock(
  import('geist/font/mono'),
  () => ({ GeistMono: { variable: 'geist-mono' } }) as unknown as MonoFontModule,
)
vi.mock(
  import('geist/font/sans'),
  () => ({ GeistSans: { variable: 'geist-sans' } }) as unknown as SansFontModule,
)
vi.mock(
  import('@/components/ui/sidebar'),
  () =>
    ({
      SidebarProvider: ({ children }: { children: ReactNode }) => children,
      SidebarInset: ({ children }: { children: ReactNode }) => children,
    }) as unknown as SidebarModule,
)
vi.mock(import('@/components/app-sidebar'), () => ({
  AppSidebar: () => <aside />,
}))
vi.mock(import('@/components/navbar'), () => ({
  Navbar: () => <nav />,
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: getCurrentUserMock,
}))
vi.mock(
  import('next/headers'),
  () =>
    ({
      cookies: cookiesMock,
      headers: headersMock,
    }) as unknown as HeadersModule,
)
vi.mock(import('next/navigation'), () => ({
  redirect: redirectMock,
}))
vi.mock(
  import('@/lib/auth/auth-provider'),
  () =>
    ({
      AuthProvider: ({ children }: { children: ReactNode }) => children,
    }) as unknown as AuthProviderModule,
)
vi.mock(
  import('@/lib/preferences/theme-context'),
  () =>
    ({
      ThemeProvider: ({ children }: { children: ReactNode }) => children,
    }) as unknown as ThemeContextModule,
)
vi.mock(
  import('@/lib/preferences/list-style-context'),
  () =>
    ({
      ListStyleProvider: ({ children }: { children: ReactNode }) => children,
    }) as unknown as ListStyleContextModule,
)
vi.mock(
  import('@/lib/preferences/feed-style-context'),
  () =>
    ({
      FeedStyleProvider: ({ children }: { children: ReactNode }) => children,
    }) as unknown as FeedStyleContextModule,
)
vi.mock(
  import('@/lib/preferences/theme-script'),
  () =>
    ({
      THEME_INIT_SCRIPT: 'window.__THEME__="light"',
    }) as unknown as ThemeScriptModule,
)
vi.mock(import('@/lib/gtm/gtm-consent-loader'), () => ({
  GtmConsentLoader: () => null,
}))
vi.mock(import('@/lib/gtm/gtm-id'), () => ({
  getValidGtmId: vi.fn<(gtmId: string | undefined) => string | undefined>(gtmId => gtmId),
}))
vi.mock(import('@/components/cookie-consent-banner'), () => ({
  CookieConsentBanner: () => null,
}))
vi.mock(import('@sentry/nextjs'), () => ({
  getTraceData: vi.fn<() => Record<string, string>>(() => ({})),
}))
vi.mock(import('sonner'), () => ({ Toaster: () => null }) as unknown as SonnerModule)
vi.mock(import('@/lib/seo/metadata'), () => ({
  createRootMetadata: vi.fn<() => Record<string, string>>(() => ({})),
}))
vi.mock(
  import('@/lib/aside-provider'),
  () =>
    ({
      AsideProvider: ({ children }: { children: ReactNode }) => children,
    }) as unknown as AsideProviderModule,
)
vi.mock(
  import('@/lib/votes/vote-store-provider'),
  () =>
    ({
      VoteStoreProvider: ({ children }: { children: ReactNode }) => children,
    }) as unknown as VoteStoreProviderModule,
)
vi.mock(import('@/components/ui/tooltip'), () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock(import('@/components/seo/structured-data-script'), () => ({
  StructuredDataScript: () => <script type='application/ld+json' />,
}))
vi.mock(
  import('@/components/seo/speculation-rules-script'),
  () => ({ SpeculationRulesScript: () => null }) as unknown as SpeculationRulesScriptModule,
)
vi.mock(import('@/components/seo/resource-hints'), () => ({
  ResourceHints: () => null,
}))
vi.mock(import('@/lib/navigation/public-nav'), () => ({
  PUBLIC_NAV_ITEMS: [],
}))
vi.mock(import('@/lib/seo/structured-data'), () => ({
  createSiteNavigationSchema: vi.fn<() => Record<string, never>>(() => ({})),
}))
vi.mock(import('@/lib/seo/site-navigation-routes'), () => ({
  shouldRenderSiteNavigationSchema: vi.fn<() => false>(() => false),
}))
vi.mock(import('@/components/scroll-to-top'), () => ({
  ScrollToTop: () => null,
}))
const originalImageOrigin = process.env.IMAGE_ORIGIN
function getElementChildren(element: ReactElement): ReactNode[] {
  const { children } = element.props as { children?: ReactNode }
  if (Array.isArray(children)) return children.flatMap(child => getReactChildren(child))
  return getReactChildren(children)
}
function getReactChildren(children: ReactNode): ReactNode[] {
  return children === null || children === undefined || typeof children === 'boolean'
    ? []
    : [children]
}
const isReactElementWithProps: (item: ReactNode) => item is ReactElement<Record<string, unknown>> =
  isValidElement

function isSpeculationRulesElement(item: ReactNode): item is ReactElement<{ nonce?: string }> {
  return isReactElementWithProps(item) && item.type === SpeculationRulesScript
}
function isRootAppShellElement(item: ReactNode): item is ReactElement<{ uiLocale: string }> {
  return isReactElementWithProps(item) && item.type === RootAppShell
}
function findDirectElementByType(element: ReactElement, type: string): ReactElement {
  const child = getElementChildren(element).find(
    item => isReactElementWithProps(item) && item.type === type,
  )

  expect(child).toBeDefined()
  return child as ReactElement
}

function findScriptById(element: ReactElement, id: string): ReactElement {
  const script = getElementChildren(element).find(
    item => isReactElementWithProps(item) && item.type === 'script' && item.props.id === id,
  )

  expect(script).toBeDefined()
  return script as ReactElement
}
describe('RootLayout', () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(null)
    headersMock.mockResolvedValue({
      get: key => {
        if (key === 'x-nonce') return 'nonce-1'
        if (key === 'x-pathname') return '/'
        return null
      },
    })
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    })
    redirectMock.mockImplementation(() => {
      throw new Error('unexpected redirect')
    })
    process.env.IMAGE_ORIGIN = 'https://images.example.com/'
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    if (originalImageOrigin === undefined) {
      delete process.env.IMAGE_ORIGIN
    } else {
      process.env.IMAGE_ORIGIN = originalImageOrigin
    }
  })
  it('renders the escaped runtime public config bootstrap script with the request nonce', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client</script>')
    vi.stubEnv('NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY', 'push-key')
    const layout = await RootLayout({ children: <p>child</p> })
    const body = findDirectElementByType(layout, 'body')
    const script = findScriptById(body, 'runtime-public-config-init')
    const scriptProps = script.props as {
      nonce?: string
      dangerouslySetInnerHTML?: Partial<Record<'__html', string>>
    }
    expect(scriptProps.nonce).toBe('nonce-1')
    expect(scriptProps.dangerouslySetInnerHTML?.['__html']).toContain(
      String.raw`"googleClientId":"google-client\u003c/script>"`,
    )
    expect(scriptProps.dangerouslySetInnerHTML?.['__html']).toContain(
      String.raw`"webPushPublicKey":"push-key"`,
    )
  })
  it('renders the normalized image origin bootstrap script with the request nonce', async () => {
    const layout = await RootLayout({ children: <p>child</p> })
    const body = findDirectElementByType(layout, 'body')
    const script = findScriptById(body, 'image-origin-init')
    const scriptProps = script.props as {
      nonce?: string
      dangerouslySetInnerHTML?: Partial<Record<'__html', string>>
    }
    expect(scriptProps.nonce).toBe('nonce-1')
    expect(scriptProps.dangerouslySetInnerHTML?.['__html']).toBe(
      'window.__IMAGE_ORIGIN__="https://images.example.com"',
    )
  })
  it('renders anonymous navigation speculation rules with the request nonce', async () => {
    const layout = await RootLayout({ children: <p>child</p> })
    const body = findDirectElementByType(layout, 'body')
    const script = getElementChildren(body).find(isSpeculationRulesElement)
    expect(script?.props.nonce).toBe('nonce-1')
  })
  it('does not render navigation speculation rules for authenticated users', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' } as User)
    const layout = await RootLayout({ children: <p>child</p> })
    const body = findDirectElementByType(layout, 'body')
    const script = getElementChildren(body).find(isSpeculationRulesElement)
    expect(script).toBeUndefined()
  })
  it('threads the resolved Accept-Language locale into RootAppShell for an anonymous request (Worker anon cache is partitioned by locale, issue #6994)', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    headersMock.mockResolvedValue({
      get: key => {
        if (key === 'x-nonce') return 'nonce-1'
        if (key === 'x-pathname') return '/'
        if (key === 'accept-language') return 'es'
        return null
      },
    })
    const layout = await RootLayout({ children: <p>child</p> })
    const body = findDirectElementByType(layout, 'body')
    const rootAppShell = getElementChildren(body).find(isRootAppShellElement)
    expect((layout.props as { lang: string }).lang).toBe('es')
    expect(rootAppShell?.props.uiLocale).toBe('es')
    expect(rootAppShell?.props).not.toHaveProperty('featureFlags')
  })
})
