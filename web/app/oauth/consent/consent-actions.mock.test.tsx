import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDecide, mockOnError } = vi.hoisted(() => ({
  mockDecide: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/oauth-authorization'), () => ({
  decideOAuthAuthorizationRequest: mockDecide,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: vi.fn<() => void>(),
}))

import { ConsentActions } from './consent-actions'

describe('ConsentActions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('locks both decisions while approval is pending', () => {
    mockDecide.mockReturnValue(new Promise(() => {}))
    render(<ConsentActions requestId='request-1' />)

    fireEvent.click(screen.getByRole('button', { name: 'Allow access' }))

    expect(mockDecide).toHaveBeenCalledWith('request-1', 'approve')
    expect(screen.getByRole('button', { name: 'Allow access' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled()
  })

  it('reports a failed denial and lets the user retry', async () => {
    const error = new Error('network failed')
    mockDecide.mockRejectedValueOnce(error)
    render(<ConsentActions requestId='request-1' />)

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))

    await waitFor(() => expect(mockOnError).toHaveBeenCalledWith(error, expect.any(Object)))
    expect(screen.getByRole('button', { name: 'Allow access' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled()
  })
})
