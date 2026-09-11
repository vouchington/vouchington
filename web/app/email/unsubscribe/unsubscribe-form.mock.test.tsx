import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsubscribeForm } from './unsubscribe-form'

const { mockOnError, mockOnSuccess, mockUnsubscribeEmailToken } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
  mockUnsubscribeEmailToken: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/my'), () => ({
  unsubscribeEmailToken: mockUnsubscribeEmailToken,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

describe('UnsubscribeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits once and renders loading and completed states', async () => {
    let resolveRequest!: () => void
    mockUnsubscribeEmailToken.mockReturnValueOnce(
      new Promise(resolve => {
        resolveRequest = () => resolve({ ok: true })
      }),
    )
    render(<UnsubscribeForm token='signed-token' />)

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(screen.getByRole('button', { name: 'Unsubscribing' })).toBeDisabled()

    await act(async () => resolveRequest())

    expect(screen.getByRole('button', { name: 'Unsubscribed' })).toBeDisabled()
    expect(mockUnsubscribeEmailToken).toHaveBeenCalledWith('signed-token')
    expect(mockOnSuccess).toHaveBeenCalledWith('Unsubscribed')
  })

  it('reports delivery failures and restores the submit state', async () => {
    const error = new Error('network')
    mockUnsubscribeEmailToken.mockRejectedValueOnce(error)
    render(<UnsubscribeForm token='signed-token' />)

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(error, {
        fallback: 'Failed to unsubscribe',
        tags: { form: 'public-email-unsubscribe' },
      }),
    )
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeEnabled()
  })

  it('explains when the unsubscribe token is missing', () => {
    render(<UnsubscribeForm token='' />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Invalid or missing unsubscribe token. Check the link in your email.',
    )
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeDisabled()
  })
})
