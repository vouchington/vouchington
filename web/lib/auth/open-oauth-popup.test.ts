import { afterEach, describe, expect, it, vi } from 'vitest'
import { openOAuthPopup } from './open-oauth-popup'
import { OAuthCancelledError } from './oauth-error'

describe('open-oauth-popup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('openOAuthPopup', () => {
    it('resolves when the popup posts a matching auth code', async () => {
      const popup = { closed: false }
      vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)

      const authPromise = openOAuthPopup({
        authUrl: new URL('https://example.com/oauth'),
        popupName: 'github-oauth',
        provider: 'github',
        providerLabel: 'GitHub',
        state: 'state-123',
      })

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { provider: 'github', code: 'code-123', state: 'state-123' },
          origin: window.location.origin,
          source: popup as unknown as MessageEventSource,
        }),
      )

      await expect(authPromise).resolves.toEqual({ code: 'code-123' })
    })

    it('rejects when the popup cannot be opened', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null)

      await expect(
        openOAuthPopup({
          authUrl: new URL('https://example.com/oauth'),
          popupName: 'github-oauth',
          provider: 'github',
          providerLabel: 'GitHub',
          state: 'state-123',
        }),
      ).rejects.toBeInstanceOf(OAuthCancelledError)
    })

    it('rejects when the popup closes before sending a message', async () => {
      vi.useFakeTimers()

      const popup = { closed: false }
      vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)

      const authPromise = openOAuthPopup({
        authUrl: new URL('https://example.com/oauth'),
        popupName: 'github-oauth',
        provider: 'github',
        providerLabel: 'GitHub',
        state: 'state-123',
      })
      const rejection = authPromise.then(
        () => undefined,
        (error: unknown) => error,
      )

      popup.closed = true
      await vi.advanceTimersByTimeAsync(500)

      expect(await rejection).toBeInstanceOf(OAuthCancelledError)
    })

    it('ignores non-matching messages until a valid one arrives', async () => {
      const popup = { closed: false }
      vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)

      const authPromise = openOAuthPopup({
        authUrl: new URL('https://example.com/oauth'),
        popupName: 'github-oauth',
        provider: 'github',
        providerLabel: 'GitHub',
        state: 'state-123',
      })

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { provider: 'linkedin', code: 'wrong-code', state: 'state-123' },
          origin: window.location.origin,
          source: popup as unknown as MessageEventSource,
        }),
      )

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { provider: 'github', code: 'code-456', state: 'state-123' },
          origin: window.location.origin,
          source: popup as unknown as MessageEventSource,
        }),
      )

      await expect(authPromise).resolves.toEqual({ code: 'code-456' })
    })
  })
})
