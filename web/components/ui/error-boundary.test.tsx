import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './error-boundary'

function ThrowingChild(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary fallback={<div>fallback</div>}>
        <div>child content</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('child content')).toBeDefined()
    expect(screen.queryByText('fallback')).toBeNull()
  })

  it('renders the fallback when a child throws during render', () => {
    // React's dev-mode error boundary logging is expected noise here, not a real failure.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary fallback={<div>fallback</div>}>
        <ThrowingChild />
      </ErrorBoundary>,
    )

    expect(screen.getByText('fallback')).toBeDefined()
  })
})
