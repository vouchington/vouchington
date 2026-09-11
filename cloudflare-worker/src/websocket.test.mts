import { describe, expect, it } from 'vitest'
import { handleWebSocket, isDevHmrWebSocketProxyAllowed } from './websocket.mts'
import type { Env } from './types.mts'

describe('handleWebSocket', () => {
  it('rejects malformed WEB_ORIGIN values', () => {
    expect(
      isDevHmrWebSocketProxyAllowed({
        DEV_WEBSOCKET_PROXY: 'true',
        WEB_ORIGIN: 'not-a-url',
      }),
    ).toBe(false)
  })

  it('rejects non-HTTP local WEB_ORIGIN values', () => {
    expect(
      isDevHmrWebSocketProxyAllowed({
        DEV_WEBSOCKET_PROXY: 'true',
        WEB_ORIGIN: 'ws://localhost:3000',
      }),
    ).toBe(false)
  })

  it('rejects non-HMR websocket paths', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      DEV_WEBSOCKET_PROXY: 'true',
      SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
    }

    const response = await handleWebSocket(
      new Request('https://voucha.ai/sitemap.xml', {
        headers: { Upgrade: 'websocket' },
      }),
      new URL('https://voucha.ai/sitemap.xml'),
      env,
    )

    expect(response.status).toBe(400)
  })
})
