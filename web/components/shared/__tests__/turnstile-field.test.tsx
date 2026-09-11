import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TurnstileField } from '@/components/shared/turnstile-field'

describe('TurnstileField', () => {
  it('renders the widget container', () => {
    const { container } = render(
      <TurnstileField turnstile={{ containerRef: () => {}, isError: false }} />,
    )
    expect(container.querySelector('[data-pw="turnstile-container"]')).not.toBeNull()
    expect(screen.queryByText(/verification failed to load/i)).toBeNull()
  })

  it('renders nothing when always-approve is active', () => {
    const { container } = render(
      <TurnstileField
        turnstile={{ containerRef: () => {}, isError: false, alwaysApprove: true }}
      />,
    )
    expect(container.querySelector('[data-pw="turnstile-container"]')).toBeNull()
  })

  it('renders an error message when the widget fails to load', () => {
    const { container } = render(
      <TurnstileField turnstile={{ containerRef: () => {}, isError: true }} />,
    )
    expect(container.querySelector('[data-pw="turnstile-container"]')).not.toBeNull()
    expect(screen.getByText(/verification failed to load/i)).toBeInTheDocument()
  })
})
