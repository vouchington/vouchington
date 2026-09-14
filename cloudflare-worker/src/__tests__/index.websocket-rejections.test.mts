import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

describe('WebSocket upgrade rejections', () => {
  beforeEach(() => {
    setupMemoryCaches()
    globalThis.fetch = vi.fn<VitestLooseMock>() as unknown as typeof fetch
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('rejects production WebSocket upgrades even if DEV_WEBSOCKET_PROXY is set', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      DEV_WEBSOCKET_PROXY: 'true',
      PRODUCTION: 'true',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/_next/hmr', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('rejects non-local WEB_ORIGIN even if DEV_WEBSOCKET_PROXY is set', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      DEV_WEBSOCKET_PROXY: 'true',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/_next/hmr', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('rejects backend WebSocket upgrades without fetching the origin', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      DEV_WEBSOCKET_PROXY: 'true',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/session', {
        method: 'POST',
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
