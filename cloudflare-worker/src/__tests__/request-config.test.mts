import { describe, expect, it } from 'vitest'
import { getWorkerRequestConfig } from '../request-config.mts'

describe('getWorkerRequestConfig anonymous cache TTL', () => {
  it('defaults to the PR1 safety TTL of 30 seconds', () => {
    expect(getWorkerRequestConfig({}).anonCacheTtlSeconds).toBe(30)
  })

  it('uses a positive ANON_CACHE_TTL_SECONDS override', () => {
    expect(getWorkerRequestConfig({ ANON_CACHE_TTL_SECONDS: '123' }).anonCacheTtlSeconds).toBe(123)
  })
})
