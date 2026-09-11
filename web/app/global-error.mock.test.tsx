import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import GlobalError from './global-error'

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

  it('calls reset when "Try again" is clicked', () => {
    const reset = vi.fn<VitestLooseMock>()
    render(
      <GlobalError
        error={new Error('oops')}
        reset={reset}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledTimes(1)
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
