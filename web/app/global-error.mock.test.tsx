import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { seedMessages } from '@/lib/i18n/use-translations'
import GlobalError from './global-error'

const { invalidateMessages, invalidateRouteMessages } = vi.hoisted(() => ({
  invalidateMessages: vi.fn<(locale: string) => void>(),
  invalidateRouteMessages: vi.fn<(locale: string, pathname: string) => void>(),
}))

const UI_MESSAGES_KEY: keyof Window = '__UI_MESSAGES__'

vi.mock(import('@/lib/i18n/use-translations'), async importOriginal => ({
  ...(await importOriginal()),
  invalidateMessages,
}))

vi.mock(import('@/lib/i18n/route-messages-cache'), async importOriginal => ({
  ...(await importOriginal()),
  invalidateRouteMessages,
}))

vi.mock(import('./globals.css'), () => ({}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

describe('GlobalError', () => {
  let previousBootstrap: Window['__UI_MESSAGES__']
  let previousPathname: string

  beforeEach(() => {
    previousBootstrap = Reflect.get(window, UI_MESSAGES_KEY) as Window['__UI_MESSAGES__']
    previousPathname = window.location.pathname
  })

  afterEach(() => {
    invalidateMessages.mockReset()
    invalidateRouteMessages.mockReset()
    if (previousBootstrap === undefined) Reflect.deleteProperty(window, UI_MESSAGES_KEY)
    else Reflect.set(window, UI_MESSAGES_KEY, previousBootstrap)
    window.history.pushState({}, '', previousPathname)
  })

  it('loads runtime public configuration for the standalone error document', () => {
    render(
      <GlobalError
        error={new Error('unexpected')}
        reset={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(document.querySelector('#runtime-public-config-init')).toHaveAttribute(
      'src',
      '/runtime-sentry-config.js',
    )
  })

  it('renders 429-specific copy from digest', () => {
    const reset = vi.fn<VitestLooseMock>()
    render(
      <GlobalError
        error={Object.assign(new Error('rate limited'), { digest: 'EXPECTED_CLIENT_ERROR;429' })}
        reset={reset}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Too many requests' })).toBeInTheDocument()
    expect(screen.getByText(/sending requests too quickly/i)).toBeInTheDocument()
    expect(screen.getByText('429')).toBeInTheDocument()
  })

  it('renders generic copy when no digest is present', () => {
    const reset = vi.fn<VitestLooseMock>()
    render(
      <GlobalError
        error={new Error('unexpected')}
        reset={reset}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText(/something went sideways on our end/i)).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('renders Portuguese bootstrap copy and invalidates its current route before reset', async () => {
    const reset = vi.fn<VitestLooseMock>()
    const catalog = await loadJsonMessages('pt')
    seedMessages('pt', catalog)
    Reflect.set(window, UI_MESSAGES_KEY, { locale: 'pt', catalog: {} })
    window.history.pushState({}, '', '/my/notifications?tab=unread')
    render(
      <GlobalError
        error={new Error('oops')}
        reset={reset}
      />,
    )

    const t = createTranslator('pt', catalog)
    fireEvent.click(
      screen.getByRole('button', {
        name: t('extracted.app.globalError.tryAgain_d8b8392e'),
      }),
    )
    expect(invalidateMessages).toHaveBeenCalledExactlyOnceWith('pt')
    expect(invalidateRouteMessages).toHaveBeenCalledExactlyOnceWith('pt', '/my/notifications')
    expect(reset).toHaveBeenCalledTimes(1)
    expect(invalidateMessages).toHaveBeenCalledBefore(reset)
    expect(invalidateRouteMessages).toHaveBeenCalledBefore(reset)
  })

  it('renders "Go home" link pointing to /', () => {
    const reset = vi.fn<VitestLooseMock>()
    render(
      <GlobalError
        error={new Error('oops')}
        reset={reset}
      />,
    )

    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/')
  })
})
