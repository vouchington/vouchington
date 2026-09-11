import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStartOAuthBrokerAuthorization = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockOnError = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/auth/oauth-broker'), () => ({
  startOAuthBrokerAuthorization: mockStartOAuthBrokerAuthorization,
}))
vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))

import { OAuthBrokerButton } from '../oauth-broker-button'

describe('OAuthBrokerButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts the broker once and shows its in-flight state', async () => {
    const brokerFailure = Promise.withResolvers<void>()
    mockStartOAuthBrokerAuthorization.mockReturnValue(brokerFailure.promise)

    render(
      <>
        <OAuthBrokerButton
          provider='github'
          purpose='connect'
          returnTo='/my/identity'
        />
        <OAuthBrokerButton
          provider='facebook'
          purpose='connect'
          returnTo='/my/identity'
        />
      </>,
    )
    const button = screen.getByRole('button', { name: 'Continue with GitHub' })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Facebook' }))

    expect(mockStartOAuthBrokerAuthorization).toHaveBeenCalledTimes(1)
    expect(mockStartOAuthBrokerAuthorization).toHaveBeenCalledWith({
      provider: 'github',
      purpose: 'connect',
      returnTo: '/my/identity',
    })
    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue with Facebook' })).toBeDisabled()

    brokerFailure.reject(new Error('cancelled'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Continue with Facebook' })).toBeEnabled()
    })
  })

  it('restores the button and reports a broker failure', async () => {
    const error = new Error('broker failed')
    mockStartOAuthBrokerAuthorization.mockRejectedValue(error)

    render(
      <OAuthBrokerButton
        provider='facebook'
        purpose='authenticate'
        returnTo='/'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Facebook' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue with Facebook' })).toBeEnabled()
    })
    expect(mockOnError).toHaveBeenCalledWith(error, {
      fallback: 'Unable to connect Facebook. Please try again.',
      tags: { form: 'oauth-broker', provider: 'facebook', purpose: 'authenticate' },
    })
  })
})
