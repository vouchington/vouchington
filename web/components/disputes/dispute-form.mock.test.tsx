import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('@/components/shared/turnstile-field'), () => ({
  TurnstileField: () => <div data-testid='turnstile-field' />,
}))

import { DisputeForm } from './dispute-form'

const mockTurnstile = {
  token: 'test-token',
  reset: vi.fn<() => void>(),
  containerRef: vi.fn<() => void>(),
  isError: false,
  alwaysApprove: false,
}

function makeProps(overrides: Partial<Parameters<typeof DisputeForm>[0]> = {}) {
  return {
    submitted: false,
    reason: '',
    claimText: '',
    loading: false,
    error: null,
    turnstile: mockTurnstile,
    onReasonChange: vi.fn<() => void>(),
    onClaimTextChange: vi.fn<() => void>(),
    onSubmit: vi.fn<() => void>(),
    onClose: vi.fn<() => void>(),
    ...overrides,
  }
}

describe('DisputeForm', () => {
  it('renders the form fields when not submitted', () => {
    render(<DisputeForm {...makeProps()} />)
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/your claim/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit dispute/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('submit button is disabled when reason and claimText are empty', () => {
    render(<DisputeForm {...makeProps()} />)
    expect(screen.getByRole('button', { name: /submit dispute/i })).toBeDisabled()
  })

  it('submit button is disabled when loading', () => {
    render(
      <DisputeForm {...makeProps({ loading: true, reason: 'other', claimText: 'some text' })} />,
    )
    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled()
  })

  it('submit button is disabled when turnstile token is null', () => {
    render(
      <DisputeForm
        {...makeProps({
          reason: 'other',
          claimText: 'some text',
          turnstile: { ...mockTurnstile, token: null },
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /submit dispute/i })).toBeDisabled()
  })

  it('calls onClaimTextChange when textarea changes', () => {
    const onClaimTextChange = vi.fn<() => void>()
    render(<DisputeForm {...makeProps({ onClaimTextChange })} />)
    fireEvent.change(screen.getByLabelText(/your claim/i), { target: { value: 'my claim' } })
    expect(onClaimTextChange).toHaveBeenCalledWith('my claim')
  })

  it('calls onSubmit when form is submitted', () => {
    const onSubmit = vi.fn<() => void>()
    render(
      <DisputeForm
        {...makeProps({ reason: 'factually_inaccurate', claimText: 'wrong fact', onSubmit })}
      />,
    )
    fireEvent.submit(screen.getByRole('button', { name: /submit dispute/i }).closest('form')!)
    expect(onSubmit).toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn<() => void>()
    render(<DisputeForm {...makeProps({ onClose })} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders error message when error is provided', () => {
    render(<DisputeForm {...makeProps({ error: 'Something went wrong' })} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders character count for claim text', () => {
    render(<DisputeForm {...makeProps({ claimText: 'hello' })} />)
    expect(screen.getByText('5/4000')).toBeInTheDocument()
  })

  it('renders submitted state with success message and Close button', () => {
    const onClose = vi.fn<() => void>()
    render(<DisputeForm {...makeProps({ submitted: true, onClose })} />)
    expect(screen.getByText(/dispute has been submitted/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My Disputes' })).toHaveAttribute(
      'href',
      '/my/disputes',
    )
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit dispute/i })).not.toBeInTheDocument()
  })

  it('calls onClose when Close button is clicked in submitted state', () => {
    const onClose = vi.fn<() => void>()
    render(<DisputeForm {...makeProps({ submitted: true, onClose })} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('has data-pw on claim text textarea', () => {
    const { container } = render(<DisputeForm {...makeProps()} />)
    expect(container.querySelector('[data-pw="claim-text"]')).not.toBeNull()
  })

  it('has data-pw on submitted state', () => {
    const { container } = render(<DisputeForm {...makeProps({ submitted: true })} />)
    expect(container.querySelector('[data-pw="dispute-submitted"]')).not.toBeNull()
  })

  it('has data-pw="dispute-form" on the form element', () => {
    const { container } = render(<DisputeForm {...makeProps()} />)
    expect(container.querySelector('[data-pw="dispute-form"]')).not.toBeNull()
  })
})
