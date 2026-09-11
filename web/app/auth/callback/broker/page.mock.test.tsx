import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

const mockCompleteOAuthAuthorization = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockAcknowledgeOAuthAuthorization = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/client'), () => ({
  acknowledgeOAuthAuthorization: mockAcknowledgeOAuthAuthorization,
  completeOAuthAuthorization: mockCompleteOAuthAuthorization,
}))
import { ApiError } from '@/lib/api/error'
import OAuthBrokerCallbackPage from './page'

const mockNav = createNavMock()
const opener = { closed: false, postMessage: vi.fn<VitestLooseMock>() }

describe('OAuth broker callback page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mockNav.setSearchParams('flow_id=flow-1')
    mockAcknowledgeOAuthAuthorization.mockReset()
    mockAcknowledgeOAuthAuthorization.mockResolvedValue(undefined)
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: opener,
    })
    vi.spyOn(window, 'close').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('retries a lost terminal response before acknowledging the replay', async () => {
    vi.useFakeTimers()
    mockCompleteOAuthAuthorization
      .mockRejectedValueOnce(new ApiError('response lost', 500))
      .mockResolvedValueOnce({ user: { id: 'user-1' } })

    render(<OAuthBrokerCallbackPage />)
    await vi.waitFor(() => expect(mockCompleteOAuthAuthorization).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(1000)

    await vi.waitFor(() => {
      expect(opener.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ flowId: 'flow-1', status: 'authenticated' }),
        window.location.origin,
      )
    })
    confirmReceipt()

    await vi.waitFor(() => {
      expect(mockCompleteOAuthAuthorization).toHaveBeenCalledTimes(2)
      expect(mockAcknowledgeOAuthAuthorization).toHaveBeenCalledWith('flow-1')
    })
  })

  it('relays a terminal result when best-effort acknowledgement fails', async () => {
    mockCompleteOAuthAuthorization.mockResolvedValue({ oauth_account: { id: 'account-1' } })
    mockAcknowledgeOAuthAuthorization.mockRejectedValue(new Error('acknowledgement lost'))

    render(<OAuthBrokerCallbackPage />)

    await waitFor(() => {
      expect(opener.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ flowId: 'flow-1', status: 'connected' }),
        window.location.origin,
      )
    })
    confirmReceipt()
    await waitFor(() => expect(window.close).toHaveBeenCalled())
  })

  it('retains the completion credential until its opener confirms receipt', async () => {
    mockCompleteOAuthAuthorization.mockResolvedValue({ user: { id: 'user-1' } })
    const firstPopup = render(<OAuthBrokerCallbackPage />)

    await waitFor(() => expect(opener.postMessage).toHaveBeenCalled())
    expect(mockAcknowledgeOAuthAuthorization).not.toHaveBeenCalled()
    expect(window.close).not.toHaveBeenCalled()

    firstPopup.unmount()
    confirmReceipt()
    expect(mockAcknowledgeOAuthAuthorization).not.toHaveBeenCalled()

    render(<OAuthBrokerCallbackPage />)
    await waitFor(() => expect(opener.postMessage).toHaveBeenCalledTimes(2))
    confirmReceipt()

    await waitFor(() => {
      expect(mockAcknowledgeOAuthAuthorization).toHaveBeenCalledWith('flow-1')
      expect(window.close).toHaveBeenCalled()
    })
  })

  it('stops waiting after the bounded receipt timeout without acknowledging', async () => {
    vi.useFakeTimers()
    mockCompleteOAuthAuthorization.mockResolvedValue({ user: { id: 'user-1' } })

    render(<OAuthBrokerCallbackPage />)
    await vi.waitFor(() => expect(opener.postMessage).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(9999)

    expect(mockAcknowledgeOAuthAuthorization).not.toHaveBeenCalled()
    expect(screen.queryByText('Unable to connect. Please try again.')).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(1)

    expect(screen.getByText('Unable to connect. Please try again.')).toBeVisible()
    expect(mockAcknowledgeOAuthAuthorization).not.toHaveBeenCalled()
    expect(window.close).not.toHaveBeenCalled()
  })

  it('stops waiting when its opener closes without acknowledging', async () => {
    vi.useFakeTimers()
    const closingOpener = { closed: false, postMessage: vi.fn<VitestLooseMock>() }
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: closingOpener,
    })
    mockCompleteOAuthAuthorization.mockResolvedValue({ user: { id: 'user-1' } })

    render(<OAuthBrokerCallbackPage />)
    await vi.waitFor(() => expect(closingOpener.postMessage).toHaveBeenCalled())
    closingOpener.closed = true
    await vi.advanceTimersByTimeAsync(250)

    await vi.waitFor(() => {
      expect(screen.getByText('Unable to connect. Please try again.')).toBeVisible()
    })
    expect(mockAcknowledgeOAuthAuthorization).not.toHaveBeenCalled()
    expect(window.close).not.toHaveBeenCalled()
  })

  it('hands a durable MFA attempt back to the login screen', async () => {
    mockCompleteOAuthAuthorization.mockResolvedValue({
      mfa_required: true,
      login_attempt_id: 'attempt-1',
    })

    render(<OAuthBrokerCallbackPage />)

    await waitFor(() => {
      expect(opener.postMessage).toHaveBeenCalledWith(
        {
          type: 'voucha:oauth-broker:complete',
          flowId: 'flow-1',
          status: 'mfa_required',
          loginAttemptId: 'attempt-1',
        },
        window.location.origin,
      )
    })
  })

  it('relays a connected account without exposing account data', async () => {
    mockCompleteOAuthAuthorization.mockResolvedValue({ oauth_account: { id: 'account-1' } })

    render(<OAuthBrokerCallbackPage />)

    await waitFor(() => {
      expect(opener.postMessage).toHaveBeenCalledWith(
        {
          type: 'voucha:oauth-broker:complete',
          flowId: 'flow-1',
          status: 'connected',
        },
        window.location.origin,
      )
    })
  })

  it('reports completion failures to its opener', async () => {
    mockCompleteOAuthAuthorization.mockRejectedValue(new Error('exchange failed'))

    render(<OAuthBrokerCallbackPage />)

    await waitFor(() => {
      expect(opener.postMessage).toHaveBeenCalledWith(
        {
          type: 'voucha:oauth-broker:complete',
          flowId: 'flow-1',
          status: 'failed',
        },
        window.location.origin,
      )
    })
    expect(window.close).toHaveBeenCalled()
  })

  it('shows an error when the flow id or opener is unavailable', async () => {
    mockNav.setSearchParams('')
    const { rerender } = render(<OAuthBrokerCallbackPage />)

    expect(screen.getByText('Unable to connect. Please try again.')).toBeVisible()
    expect(mockCompleteOAuthAuthorization).not.toHaveBeenCalled()

    mockNav.setSearchParams('flow_id=flow-2')
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: null,
    })
    mockCompleteOAuthAuthorization.mockResolvedValue({ user: { id: 'user-1' } })
    rerender(<OAuthBrokerCallbackPage />)

    await waitFor(() => {
      expect(screen.getByText('Unable to connect. Please try again.')).toBeVisible()
    })
  })

  it('cancels a scheduled pending poll when the page unmounts', async () => {
    vi.useFakeTimers()
    mockCompleteOAuthAuthorization.mockResolvedValue({ status: 'pending' })

    const { unmount } = render(<OAuthBrokerCallbackPage />)
    await vi.waitFor(() => {
      expect(mockCompleteOAuthAuthorization).toHaveBeenCalledTimes(1)
    })

    unmount()
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockCompleteOAuthAuthorization).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

function confirmReceipt(flowId = 'flow-1'): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'voucha:oauth-broker:received', flowId },
      origin: window.location.origin,
      source: opener as unknown as MessageEventSource,
    }),
  )
}
