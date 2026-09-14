import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { EDGE_CACHE_CANARY_PATH, EDGE_CACHE_CANARY_TAG } from '../staging-canary.mts'
import {
  INTERNAL_CANARY_FAULT_HEADER,
  STAGING_CANARY_FAULT_HEADER,
  STAGING_CANARY_SECRET_HEADER,
} from '../staging-control-headers.mts'
import { createContext, restoreGlobals } from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

const BASIC = `Basic ${btoa('staging:password')}`
const SECRET = 'canary-secret'

const stagingEnv = (overrides: Env = {}): Env => ({
  BASIC_AUTH_CREDENTIALS: 'staging:password',
  CF_WORKER_SECRET: SECRET,
  PRODUCTION: 'false',
  ...overrides,
})

describe('staging edge cache canary', () => {
  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('dispatches through CachedOrigin, remains non-discoverable, and adds a fresh request ID', async () => {
    const env = stagingEnv({ ANON_CACHE_TTL_SECONDS: '30' })
    const first = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: { authorization: BASIC },
      }),
      env,
      createContext(env),
    )
    const second = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: { authorization: BASIC },
      }),
      env,
      createContext(env),
    )

    expect(first.status).toBe(200)
    expect(first.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(first.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(first.headers.get('link')).toBeNull()
    expect(first.headers.get('cache-tag')).toBe(EDGE_CACHE_CANARY_TAG)
    expect(first.headers.get('x-request-id')).not.toBe(second.headers.get('x-request-id'))
  })

  it('remains Basic-protected in staging and hard-disabled in production', async () => {
    const staging = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`),
      stagingEnv(),
      createContext(),
    )
    const context = createContext()
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')
    const production = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: { authorization: BASIC },
      }),
      stagingEnv({ PRODUCTION: 'true' }),
      context,
    )
    const unsupportedMethod = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        method: 'HEAD',
        headers: { authorization: BASIC },
      }),
      stagingEnv(),
      createContext(),
    )

    expect(staging.status).toBe(401)
    expect(production.status).toBe(404)
    expect(unsupportedMethod.status).toBe(404)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('never advertises the private canary through public discovery documents', async () => {
    for (const path of ['/llms.txt', '/llms-full.txt', '/.well-known/api-catalog']) {
      const response = await worker.fetch(
        new Request(`https://voucha.ai${path}`),
        { PRODUCTION: 'false' },
        createContext(),
      )
      expect(await response.text()).not.toContain(EDGE_CACHE_CANARY_PATH)
    }
  })

  it('gates SIE injection and relays only the validated internal enum', async () => {
    const env = stagingEnv()
    const invalid = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: {
          [STAGING_CANARY_FAULT_HEADER]: 'sie',
          [STAGING_CANARY_SECRET_HEADER]: 'wrong',
        },
      }),
      env,
      createContext(env),
    )
    const valid = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: {
          authorization: BASIC,
          [STAGING_CANARY_FAULT_HEADER]: 'sie',
          [STAGING_CANARY_SECRET_HEADER]: SECRET,
        },
      }),
      env,
      createContext(env),
    )

    expect(invalid.status).toBe(401)
    expect(invalid.headers.get('www-authenticate')).toBeNull()
    expect(valid.status).toBe(503)
    expect(valid.headers.get('cache-control')).toContain('no-store')
    expect(valid.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(valid.headers.get(STAGING_CANARY_FAULT_HEADER)).toBeNull()
    expect(valid.headers.get(STAGING_CANARY_SECRET_HEADER)).toBeNull()
    expect(valid.headers.get(INTERNAL_CANARY_FAULT_HEADER)).toBeNull()
  })

  it('fails closed for unsupported faults and every production fault request', async () => {
    const unsupported = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: {
          authorization: BASIC,
          [STAGING_CANARY_FAULT_HEADER]: 'unknown',
          [STAGING_CANARY_SECRET_HEADER]: SECRET,
        },
      }),
      stagingEnv(),
      createContext(),
    )
    const production = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: {
          [STAGING_CANARY_FAULT_HEADER]: 'sie',
          [STAGING_CANARY_SECRET_HEADER]: SECRET,
        },
      }),
      stagingEnv({ PRODUCTION: 'true' }),
      createContext(),
    )

    expect(unsupported.status).toBe(400)
    expect(production.status).toBe(404)
  })
})
