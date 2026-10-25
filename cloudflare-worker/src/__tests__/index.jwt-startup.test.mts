import { configuredSessionKeys } from '../../test-helpers/session-keys.mts'
import { describe, expect, it, vi } from 'vitest'
import { createWorker } from '../index.mts'
import type { fetchInner as FetchInner } from '../request-handler.mts'
import { createContext } from '../../test-helpers/src/mock-env.mts'

describe('Worker session configuration boundary', () => {
  it('validates a fixed binding object once across concurrent requests', async () => {
    const fetchInner = vi.fn<typeof FetchInner>().mockResolvedValue(new Response('origin'))
    const worker = createWorker({ fetchInner, captureException: vi.fn<VitestLooseMock>() })
    let keyReads = 0
    const env = {
      ...configuredSessionKeys,
      ENVIRONMENT: 'staging',
      PRODUCTION: 'false',
      get VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64() {
        keyReads += 1
        return configuredSessionKeys.VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64
      },
    }
    const response = await worker.fetch(new Request('https://voucha.ai/'), env, createContext(env))
    expect(response.status).toBe(200)
    const bootKeyReads = keyReads
    expect(bootKeyReads).toBeGreaterThan(0)
    const laterResponses = await Promise.all([
      worker.fetch(new Request('https://voucha.ai/'), env, createContext(env)),
      worker.fetch(new Request('https://voucha.ai/'), env, createContext(env)),
    ])
    expect(laterResponses.map(result => result.status)).toEqual([200, 200])
    expect(fetchInner).toHaveBeenCalledTimes(3)
    expect(keyReads).toBe(bootKeyReads)
    const invalidEnv = { ...env, VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '' }
    const invalidResponse = await worker.fetch(
      new Request('https://voucha.ai/'),
      invalidEnv,
      createContext(invalidEnv),
    )
    expect(invalidResponse.status).toBe(500)
    expect(fetchInner).toHaveBeenCalledTimes(3)
  })
  it('does not dispatch staging requests when configured session keys are absent', async () => {
    const fetchInner = vi.fn<typeof FetchInner>().mockResolvedValue(new Response('origin'))
    const captureException = vi.fn<VitestLooseMock>()
    const worker = createWorker({ fetchInner, captureException })
    const env = {
      ENVIRONMENT: 'staging',
      PRODUCTION: 'false',
      VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '',
      VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '',
    }
    const response = await worker.fetch(new Request('https://voucha.ai/'), env, createContext(env))
    expect(response.status).toBe(500)
    expect(fetchInner).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain('VOUCHA_SESSION_JWT')
  })
  it('dispatches staging requests without edge-anon signing keys', async () => {
    const fetchInner = vi.fn<typeof FetchInner>().mockResolvedValue(new Response('origin'))
    const worker = createWorker({ fetchInner, captureException: vi.fn<VitestLooseMock>() })
    const env = {
      ENVIRONMENT: 'staging',
      PRODUCTION: 'false',
      VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: configuredSessionKeys.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64,
    }

    const response = await worker.fetch(new Request('https://voucha.ai/'), env, createContext(env))

    expect(response.status).toBe(200)
    expect(fetchInner).toHaveBeenCalledOnce()
  })
})
