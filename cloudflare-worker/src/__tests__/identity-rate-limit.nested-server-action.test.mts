import { describe, expect, it } from 'vitest'
import { checkIdentityRateLimit } from '../identity-rate-limit.mts'

const baseInput = {
  method: 'POST',
  pathname: '/some/page',
  ip: '1.2.3.4',
  isFullyCachedRoute: false,
  botTier: null,
  isServerAction: true,
} as const

describe('checkIdentityRateLimit — nested Server Action quotas', () => {
  it('passes after consuming generic mutating and Server Action quotas', async () => {
    const keys: string[] = []
    const successfulLimiter = {
      limit: ({ key }: { key: string }) => {
        keys.push(key)
        return { success: true }
      },
    }

    const result = await checkIdentityRateLimit({
      ...baseInput,
      env: {
        RATE_LIMITER_ANON_MUTATING: successfulLimiter,
        RATE_LIMITER_SERVER_ACTION: successfulLimiter,
      },
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:web:MUTATING:1.2.3.4', 'server-action:web:MUTATING:1.2.3.4'])
  })

  it('rejects after the generic quota passes and the Server Action quota fails', async () => {
    const keys: string[] = []

    const result = await checkIdentityRateLimit({
      ...baseInput,
      botTier: 'unknown',
      env: {
        RATE_LIMITER_ANON_MUTATING: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
        RATE_LIMITER_SERVER_ACTION: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: false }
          },
        },
      },
    })

    expect(result).toBe(false)
    expect(keys).toEqual(['anon:web:MUTATING:1.2.3.4', 'server-action:web:MUTATING:1.2.3.4'])
  })

  it('does not consume the Server Action quota when the generic mutating quota rejects', async () => {
    const keys: string[] = []

    const result = await checkIdentityRateLimit({
      ...baseInput,
      env: {
        RATE_LIMITER_ANON_MUTATING: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: false }
          },
        },
        RATE_LIMITER_SERVER_ACTION: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
    })

    expect(result).toBe(false)
    expect(keys).toEqual(['anon:web:MUTATING:1.2.3.4'])
  })
})
