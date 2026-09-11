import { describe, expect, it, vi } from 'vitest'
import { CACHE_PURGE_SECRET_HEADER } from '@ts-shared/cache/purge'
import worker from '../index.mts'
import { EDGE_CACHE_CANARY_PATH, EDGE_CACHE_CANARY_TAG } from '../staging-canary.mts'
import {
  STAGING_CANARY_FAULT_HEADER,
  STAGING_CANARY_SECRET_HEADER,
} from '../staging-control-headers.mts'
import { createContext } from '../test-helpers/mock-env.mts'
import type { EdgeExecutionContext, Env } from '../types.mts'

const BASIC = `Basic ${btoa('staging:password')}`
const SECRET = 'canary-secret'
const env: Env = {
  BASIC_AUTH_CREDENTIALS: 'staging:password',
  CF_WORKER_SECRET: SECRET,
  PRODUCTION: 'false',
}

const expectSecuredFailure = (response: Response, status: number) => {
  expect(response.status).toBe(status)
  expect(response.headers.get('content-type')).toContain('application/json')
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  expect(response.headers.get('x-xss-protection')).toBe('0')
  expect(response.headers.get('permissions-policy')).toContain('camera=()')
  expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
  expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
}

describe('staging edge canary failure contracts', () => {
  it('does not let a valid fault secret bypass staging Basic Auth', async () => {
    const response = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: {
          [STAGING_CANARY_FAULT_HEADER]: 'unexpected-throw',
          [STAGING_CANARY_SECRET_HEADER]: SECRET,
        },
      }),
      env,
      createContext(),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Voucha Staging')
  })

  it('maps controlled purge rejection through the existing secured 502 contract', async () => {
    const purge = vi.fn<EdgeExecutionContext['exports']['CachedOrigin']['purge']>(() =>
      Promise.resolve({ success: true, errors: [] }),
    )
    const context = createContext()
    context.exports.CachedOrigin.purge = purge
    const response = await worker.fetch(
      new Request('https://voucha.ai/infra/cache-purge', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [CACHE_PURGE_SECRET_HEADER]: SECRET,
          [STAGING_CANARY_FAULT_HEADER]: 'purge-reject',
          [STAGING_CANARY_SECRET_HEADER]: SECRET,
        },
        body: JSON.stringify({ tags: [EDGE_CACHE_CANARY_TAG] }),
      }),
      env,
      context,
    )

    expectSecuredFailure(response, 502)
    expect(purge).not.toHaveBeenCalled()
  })

  it('maps a controlled unexpected throw through the real secured 500 boundary', async () => {
    const response = await worker.fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: {
          authorization: BASIC,
          [STAGING_CANARY_FAULT_HEADER]: 'unexpected-throw',
          [STAGING_CANARY_SECRET_HEADER]: SECRET,
        },
      }),
      env,
      createContext(),
    )

    expectSecuredFailure(response, 500)
  })
})
