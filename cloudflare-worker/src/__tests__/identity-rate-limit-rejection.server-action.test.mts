import { describe, expect, it } from 'vitest'
import { checkEdgeBuckets } from '@vouchington/rate-limit/edge'
import { getServerActionRateLimitBuckets } from '../identity-rate-limit.mts'
import { getServerActionRateLimitRejection } from '../identity-rate-limit-rejection.mts'

const checkConfiguredServerActionBuckets = (
  input: Parameters<typeof getServerActionRateLimitBuckets>[0],
) => checkEdgeBuckets(getServerActionRateLimitBuckets(input), input.ip)

describe('server-action-only identity rate-limit rejection', () => {
  it('allows non-POST requests before checking the server-action binding', async () => {
    const allowed = await checkConfiguredServerActionBuckets({
      env: {
        RATE_LIMITER_SERVER_ACTION: {
          limit: async () => ({ success: false }),
        },
      },
      method: 'GET',
      pathname: '/',
      ip: '1.1.1.1',
    })

    expect(allowed).toBe(true)
  })

  it('blocks when the server-action binding is configured but the IP is absent', async () => {
    const allowed = await checkConfiguredServerActionBuckets({
      env: {
        RATE_LIMITER_SERVER_ACTION: {
          limit: async () => ({ success: true }),
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
          limit: async () => ({ success: true }),
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
          limit: async () => ({ success: false }),
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
