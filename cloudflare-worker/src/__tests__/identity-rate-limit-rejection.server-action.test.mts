import { describe, expect, it } from 'vitest'
import { checkServerActionRateLimit } from '../identity-rate-limit.mts'
import { getServerActionRateLimitRejection } from '../identity-rate-limit-rejection.mts'

describe('server-action-only identity rate-limit rejection', () => {
  it('allows non-POST requests before checking the server-action binding', async () => {
    const allowed = await checkServerActionRateLimit({
      env: {
        RATE_LIMITER_SERVER_ACTION: {
          limit: () => ({ success: false }),
        },
      },
      method: 'GET',
      pathname: '/',
      ip: '1.1.1.1',
    })

    expect(allowed).toBe(true)
  })

  it('blocks when the server-action binding is configured but the IP is absent', async () => {
    const allowed = await checkServerActionRateLimit({
      env: {
        RATE_LIMITER_SERVER_ACTION: {
          limit: () => ({ success: true }),
        },
      },
      method: 'POST',
      pathname: '/',
      ip: null,
    })

    expect(allowed).toBe(false)
  })

  it('returns 400 when a server-action limiter cannot key a missing IP', async () => {
    const response = await getServerActionRateLimitRejection(
      {
        RATE_LIMITER_SERVER_ACTION: {
          limit: () => ({ success: true }),
        },
      },
      'POST',
      '/',
      null,
    )

    expect(response?.status).toBe(400)
  })

  it('returns 429 when the server-action limiter rejects', async () => {
    const response = await getServerActionRateLimitRejection(
      {
        RATE_LIMITER_SERVER_ACTION: {
          limit: () => ({ success: false }),
        },
      },
      'POST',
      '/',
      '1.1.1.1',
    )

    expect(response?.status).toBe(429)
    expect(response?.headers.get('retry-after')).toBe('60')
  })
})
