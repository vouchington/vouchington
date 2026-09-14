import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import type { EnCatalog } from '@ts-shared/ui-messages'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { LocalizedRouteBoundary } from '../localized-route-boundary'
import { getMessagesPromise, useTranslations } from '../use-translations'
import { UiLocaleProvider } from '../ui-locale-provider'

const { getRouteMessagesPromise, seedRouteMessages } = vi.hoisted(() => ({
  getRouteMessagesPromise: vi.fn<VitestLooseMock>(),
  seedRouteMessages: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/i18n/route-messages-cache'), () => ({
  getRouteMessagesPromise,
  seedRouteMessages,
}))
vi.mock<typeof import('next/navigation')>(import('next/navigation'), () => navMockModule)

const nav = createNavMock()
const INITIAL_CATALOG: EnCatalog = { nav: { home: 'Home' } }

function RouteCopy({ id }: { id: string }) {
  const t = useTranslations()
  return <p data-testid='route-copy'>{t(id)}</p>
}

function App({
  initialCatalog = INITIAL_CATALOG,
  initialLocale = 'en',
  initialPathname = '/initial',
  locale = 'fr',
  id,
}: {
  initialCatalog?: EnCatalog
  initialLocale?: string
  initialPathname?: string
  locale?: string
  id: string
}) {
  return (
    <UiLocaleProvider uiLocale={locale}>
      <LocalizedRouteBoundary
        initialCatalog={initialCatalog}
        initialLocale={initialLocale}
        initialPathname={initialPathname}
      >
        <RouteCopy id={id} />
      </LocalizedRouteBoundary>
    </UiLocaleProvider>
  )
}

describe('LocalizedRouteBoundary', () => {
  beforeEach(() => {
    nav.reset()
    getRouteMessagesPromise.mockReset()
    seedRouteMessages.mockReset()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('renders the initial server catalog without calling the browser route loader', () => {
    nav.setPathname('/')
    render(
      <App
        initialPathname='/'
        locale='en'
        id='nav.home'
      />,
    )

    expect(screen.getByTestId('route-copy')).toHaveTextContent('Home')
    expect(getRouteMessagesPromise).not.toHaveBeenCalled()
  })

  it('keeps SSR outside Suspense when usePathname differs', () => {
    nav.setPathname('/source/01a09ae2-5a74-7520-a5ab-355d6f7e83a7')
    getRouteMessagesPromise.mockImplementation(() => {
      throw new Error('the route loader must not run while the server renders')
    })

    const html = renderToString(
      <App
        initialPathname='/'
        locale='en'
        id='nav.home'
      />,
    )

    expect(html).toBe('<p data-testid="route-copy">Home</p>')
    expect(getRouteMessagesPromise).not.toHaveBeenCalled()
  })

  it('loads and merges the destination route catalog before translated destination copy renders', async () => {
    let resolveDestination!: (catalog: EnCatalog) => void
    const destination = new Promise<EnCatalog>(resolve => {
      resolveDestination = resolve
    })
    const routePromises = new Map<string, Promise<EnCatalog>>([
      ['fr\u0000/', Promise.resolve({ nav: { home: 'Home' } })],
      ['fr\u0000/my/notifications', destination],
    ])
    getRouteMessagesPromise.mockImplementation((locale: string, pathname: string) => {
      const promise = routePromises.get(`${locale}\u0000${pathname}`)
      if (!promise) throw new Error(`missing route fixture for ${locale} ${pathname}`)
      return promise
    })

    nav.setPathname('/')
    let rendered!: ReturnType<typeof render>
    await act(async () => {
      rendered = render(<App id='nav.home' />)
      await Promise.resolve()
    })
    expect(await screen.findByTestId('route-copy')).toHaveTextContent('Home')

    nav.setPathname('/my/notifications')
    await act(async () => {
      rendered.rerender(<App id='extracted.my.settingsRoutes.account_7e1b0d56' />)
      await Promise.resolve()
    })
    expect(screen.queryByTestId('route-copy')).toBeNull()

    await act(async () => {
      resolveDestination({ extracted: { my: { settingsRoutes: { account_7e1b0d56: 'Account' } } } })
      await destination
    })

    expect(await screen.findByTestId('route-copy')).toHaveTextContent('Account')
    await expect(getMessagesPromise('fr')).resolves.toEqual({
      nav: { home: 'Home' },
      extracted: { my: { settingsRoutes: { account_7e1b0d56: 'Account' } } },
    })
    expect(getRouteMessagesPromise).toHaveBeenCalledWith('fr', '/')
    expect(getRouteMessagesPromise).toHaveBeenCalledWith('fr', '/my/notifications')
  })
})
