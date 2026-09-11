import { describe, expect, it } from 'vitest'
import { resolveStagingCanaryControl } from './staging-canary.mts'
import {
  INTERNAL_CANARY_FAULT_HEADER,
  STAGING_CANARY_FAULT_HEADER,
  STAGING_CANARY_SECRET_HEADER,
} from './staging-control-headers.mts'
import type { Env } from './types.mts'

const SECRET = 'staging-control-secret'
const env: Env = { CF_WORKER_SECRET: SECRET, PRODUCTION: 'false' }

describe('resolveStagingCanaryControl', () => {
  it('strips an externally supplied internal fault when no public controls are present', () => {
    const result = resolveStagingCanaryControl(
      new Request('https://staging.voucha.ai/ordinary', {
        headers: { [INTERNAL_CANARY_FAULT_HEADER]: 'unexpected-throw' },
      }),
      env,
    )

    expect('response' in result).toBe(false)
    if ('response' in result) throw new Error('Expected a sanitized request')
    expect(result.fault).toBeNull()
    expect(result.request.headers.has(INTERNAL_CANARY_FAULT_HEADER)).toBe(false)
  })

  it('rejects an authenticated allowed fault on the wrong route', async () => {
    const result = resolveStagingCanaryControl(
      new Request('https://staging.voucha.ai/ordinary', {
        headers: {
          [STAGING_CANARY_SECRET_HEADER]: SECRET,
          [STAGING_CANARY_FAULT_HEADER]: 'sie',
        },
      }),
      env,
    )

    expect('response' in result).toBe(true)
    if (!('response' in result)) throw new Error('Expected an invalid-target response')
    expect(result.response.status).toBe(400)
    await expect(result.response.json()).resolves.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
