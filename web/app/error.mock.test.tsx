import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ErrorPage from './error'

const { invalidateMessages, invalidateRouteMessages } = vi.hoisted(() => ({
  invalidateMessages: vi.fn<(locale: string) => void>(),
  invalidateRouteMessages: vi.fn<(locale: string, pathname: string) => void>(),
}))

vi.mock(import('@/lib/i18n/use-translations'), async importOriginal => ({
  ...(await importOriginal()),
  invalidateMessages,
}))

vi.mock(import('@/lib/i18n/route-messages-cache'), async importOriginal => ({
  ...(await importOriginal()),
  invalidateRouteMessages,
}))

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

describe('ErrorPage', () => {
  afterEach(() => {
    invalidateMessages.mockReset()
    invalidateRouteMessages.mockReset()
    window.history.pushState({}, '', '/')
  })

  it('renders 429-specific copy from digest', () => {
    const reset = vi.fn<VitestLooseMock>()
    render(
      <ErrorPage
        error={Object.assign(new Error('rate limited'), { digest: 'EXPECTED_CLIENT_ERROR;429' })}
        reset={reset}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Too many requests' })).toBeInTheDocument()
    expect(screen.getByText(/sending requests too quickly/i)).toBeInTheDocument()
    expect(screen.getByText('429')).toBeInTheDocument()
  })

  it('renders 400-specific copy from digest', () => {
    const reset = vi.fn<VitestLooseMock>()
    render(
      <ErrorPage
        error={Object.assign(new Error('bad request'), { digest: 'EXPECTED_CLIENT_ERROR;400' })}
        reset={reset}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Bad request' })).toBeInTheDocument()
    expect(screen.getByText('400')).toBeInTheDocument()
  })

  it('renders generic copy when no digest is present', () => {
    const reset = vi.fn<VitestLooseMock>()
    render(
      <ErrorPage
        error={new Error('unexpected')}
        reset={reset}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText(/something went sideways on our end/i)).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('invalidates the current locale and route before reset when "Try again" is clicked', () => {
    const reset = vi.fn<VitestLooseMock>()
    window.history.pushState({}, '', '/my/notifications?tab=unread')
    render(
      <ErrorPage
        error={new Error('oops')}
        reset={reset}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(invalidateMessages).toHaveBeenCalledExactlyOnceWith('en')
    expect(invalidateRouteMessages).toHaveBeenCalledExactlyOnceWith('en', '/my/notifications')
    expect(reset).toHaveBeenCalledTimes(1)
    expect(invalidateMessages).toHaveBeenCalledBefore(reset)
    expect(invalidateRouteMessages).toHaveBeenCalledBefore(reset)
  })

  it('renders "Home" link pointing to /', () => {
    const reset = vi.fn<VitestLooseMock>()
    render(
      <ErrorPage
        error={new Error('oops')}
        reset={reset}
      />,
    )

    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
  })
})
