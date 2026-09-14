import { describe, expect, it, vi } from 'vitest'
import { handleSentryTunnel } from './sentry-tunnel.mts'

const WEB_DSN = 'https://web_public@web.example.test/123'
const PREVIOUS_WEB_DSN = 'https://previous_web_public@previous-web.example.test/789'
const WORKER_DSN = 'https://worker_public@worker.example.test/456'

function makeRequest(dsn: string): Request {
  return new Request('https://example.test/monitoring', {
    body: `{"dsn":"${dsn}"}\n{"type":"event"}\n{}`,
    method: 'POST',
  })
}

describe('Sentry tunnel configuration', () => {
  it('accepts the explicitly injected previous browser DSN during rotation', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response(null)),
    ) as typeof fetch
    try {
      const env = {
        SENTRY_TUNNEL_PREVIOUS_WEB_DSN: PREVIOUS_WEB_DSN,
        SENTRY_WEB_DSN: WEB_DSN,
      }
      expect((await handleSentryTunnel(makeRequest(PREVIOUS_WEB_DSN), env)).status).toBe(200)
      expect((await handleSentryTunnel(makeRequest(WEB_DSN), env)).status).toBe(200)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('does not trust an unconfigured DSN when a rotation overlap is configured', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response(null)),
    ) as typeof fetch
    try {
      expect(
        (
          await handleSentryTunnel(makeRequest('https://other@other.example.test/100'), {
            SENTRY_TUNNEL_PREVIOUS_WEB_DSN: PREVIOUS_WEB_DSN,
            SENTRY_WEB_DSN: WEB_DSN,
          })
        ).status,
      ).toBe(403)
      expect(globalThis.fetch).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('does not trust the retiring DSN without a valid replacement browser DSN', async () => {
    expect(
      (
        await handleSentryTunnel(makeRequest(PREVIOUS_WEB_DSN), {
          SENTRY_DSN: WORKER_DSN,
          SENTRY_TUNNEL_PREVIOUS_WEB_DSN: PREVIOUS_WEB_DSN,
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await handleSentryTunnel(makeRequest(PREVIOUS_WEB_DSN), {
          SENTRY_TUNNEL_PREVIOUS_WEB_DSN: PREVIOUS_WEB_DSN,
          SENTRY_WEB_DSN: 'invalid',
        })
      ).status,
    ).toBe(503)
  })

  it('trusts only normalized configured web and Worker DSNs', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response(null)),
    ) as typeof fetch
    try {
      expect(
        (
          await handleSentryTunnel(makeRequest(WORKER_DSN), {
            SENTRY_WEB_DSN: WEB_DSN,
            SENTRY_DSN: WORKER_DSN,
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await handleSentryTunnel(makeRequest('https://other@web.example.test/123'), {
            SENTRY_WEB_DSN: WEB_DSN,
          })
        ).status,
      ).toBe(403)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns 503 when no valid tunnel DSNs are configured', async () => {
    expect((await handleSentryTunnel(makeRequest(WEB_DSN), {})).status).toBe(503)
  })
})
