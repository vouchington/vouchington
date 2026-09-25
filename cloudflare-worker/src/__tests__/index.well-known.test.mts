import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler — well-known discovery documents', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('serves traffic advice inline', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITE_ORIGIN: 'https://voucha.ai',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/.well-known/traffic-advice'),
      env,
      createContext(env),
    )

    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(await response.json()).toMatchObject({
      applies_to: 'https://voucha.ai',
      guidance: [{ prefer: expect.arrayContaining(['/llms.txt']) }],
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('serves the agent card inline', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITE_ORIGIN: 'https://voucha.ai',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/.well-known/agent-card.json'),
      env,
      createContext(env),
    )

    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(await response.json()).toMatchObject({
      name: 'Voucha',
      llms: 'https://voucha.ai/llms.txt',
      skills: 'https://voucha.ai/.well-known/agent-skills.json',
      mcp: {
        url: 'https://voucha.ai/api/v1/mcp',
        transport: 'streamable-http',
        authentication: { type: 'bearer' },
        api_keys: 'https://voucha.ai/my/api-keys',
      },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('serves agent skills inline', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITE_ORIGIN: 'https://voucha.ai',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/.well-known/agent-skills.json'),
      env,
      createContext(env),
    )

    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(await response.json()).toMatchObject({
      skills: [
        {
          name: 'browse-public-content',
          resources: expect.arrayContaining(['https://voucha.ai/md/posts']),
        },
        {
          name: 'use-voucha-mcp',
          resources: expect.arrayContaining(['https://voucha.ai/api/v1/mcp']),
        },
      ],
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
