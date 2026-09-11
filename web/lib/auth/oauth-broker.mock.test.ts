import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startOAuthBrokerAuthorization } from './oauth-broker'
import { OAuthCancelledError } from './oauth-error'

const mockBeginOAuthAuthorization = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/api/client'), () => ({
  beginOAuthAuthorization: mockBeginOAuthAuthorization,
}))

describe('OAuth broker popup', () => {
  beforeEach(() => {
    mockBeginOAuthAuthorization.mockReset()
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('opens a blank popup before beginning and relays only an opaque result', async () => {
    const popup = makePopup()
    const reloadPage = vi.fn<VitestLooseMock>()
    const lockManager = grantingLockManager()
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    const replaceState = vi.spyOn(window.history, 'replaceState')
    mockBeginOAuthAuthorization.mockResolvedValue({
      flow_id: '0198-flow-id',
      redirect_url: 'https://github.com/login/oauth/authorize?opaque=1',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })

    const authorization = startOAuthBrokerAuthorization(
      {
        provider: 'github',
        purpose: 'connect',
        returnTo: '/my/identity#social',
      },
      { lockManager, reloadPage },
    )

    expect(window.open).toHaveBeenCalledWith(
      '',
      expect.stringMatching(/^voucha-oauth-broker-github-/),
      'width=600,height=700',
    )
    expect(lockManager.request).toHaveBeenCalledWith(
      'voucha-oauth-broker-authorization',
      { mode: 'exclusive', ifAvailable: true },
      expect.any(Function),
    )
    await vi.waitFor(() => {
      expect(popup.location.assign).toHaveBeenCalledWith(
        'https://github.com/login/oauth/authorize?opaque=1',
      )
    })

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'voucha:oauth-broker:complete',
          flowId: '0198-flow-id',
          status: 'connected',
        },
        origin: window.location.origin,
        source: popup as unknown as MessageEventSource,
      }),
    )

    await expect(authorization).resolves.toBeUndefined()
    expect(replaceState).toHaveBeenCalledWith(window.history.state, '', '/my/identity#social')
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('fails closed when the browser blocks the synchronously opened popup', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)

    await expect(
      startOAuthBrokerAuthorization(
        {
          provider: 'github',
          purpose: 'authenticate',
          returnTo: '/',
        },
        { lockManager: grantingLockManager() },
      ),
    ).rejects.toBeInstanceOf(OAuthCancelledError)
    expect(mockBeginOAuthAuthorization).not.toHaveBeenCalled()
  })

  it('confirms a valid terminal result to the callback popup before resolving', async () => {
    const popup = makePopup()
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    mockBeginOAuthAuthorization.mockResolvedValue({
      flow_id: '0198-flow-receipt',
      redirect_url: 'https://github.com/login/oauth/authorize?opaque=1',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })

    const authorization = startOAuthBrokerAuthorization(
      {
        provider: 'github',
        purpose: 'authenticate',
        returnTo: '/',
      },
      { lockManager: grantingLockManager() },
    )
    await vi.waitFor(() => expect(popup.location.assign).toHaveBeenCalled())

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'voucha:oauth-broker:complete',
          flowId: '0198-flow-receipt',
          status: 'authenticated',
        },
        origin: window.location.origin,
        source: popup as unknown as MessageEventSource,
      }),
    )

    expect(popup.postMessage).toHaveBeenCalledWith(
      {
        type: 'voucha:oauth-broker:received',
        flowId: '0198-flow-receipt',
      },
      window.location.origin,
    )
    await expect(authorization).resolves.toBeUndefined()
  })

  it('fails closed when another browser tab holds the broker lease', async () => {
    const popup = makePopup()
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)

    await expect(
      startOAuthBrokerAuthorization(
        {
          provider: 'github',
          purpose: 'authenticate',
          returnTo: '/',
        },
        { lockManager: rejectingLockManager() },
      ),
    ).rejects.toBeInstanceOf(OAuthCancelledError)

    expect(mockBeginOAuthAuthorization).not.toHaveBeenCalled()
    expect(popup.close).toHaveBeenCalledOnce()
  })

  it('closes a hung popup and releases its lease at the authorization deadline', async () => {
    vi.useFakeTimers()
    const popup = makePopup()
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    mockBeginOAuthAuthorization.mockResolvedValue({
      flow_id: '0198-expiring-flow',
      redirect_url: 'https://github.com/login/oauth/authorize?opaque=1',
      expires_at: new Date(Date.now() + 1000).toISOString(),
    })

    const authorization = startOAuthBrokerAuthorization(
      {
        provider: 'github',
        purpose: 'authenticate',
        returnTo: '/',
      },
      { lockManager: grantingLockManager() },
    )
    const expiredAuthorization = authorization.catch(error => error)
    await vi.advanceTimersByTimeAsync(1001)

    expect(await expiredAuthorization).toBeInstanceOf(OAuthCancelledError)
    expect(popup.close).toHaveBeenCalledOnce()
  })
})

function grantingLockManager(): Pick<LockManager, 'request'> {
  return {
    request: vi.fn<VitestLooseMock>(async (_name, _options, callback) => callback({} as Lock)),
  } as Pick<LockManager, 'request'>
}

function rejectingLockManager(): Pick<LockManager, 'request'> {
  return {
    request: vi.fn<VitestLooseMock>(async (_name, _options, callback) => callback(null)),
  } as Pick<LockManager, 'request'>
}

function makePopup() {
  return {
    closed: false,
    close: vi.fn<VitestLooseMock>(),
    location: { assign: vi.fn<VitestLooseMock>() },
    postMessage: vi.fn<VitestLooseMock>(),
  }
}
