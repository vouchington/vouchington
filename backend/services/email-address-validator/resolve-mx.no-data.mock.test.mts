import { it, expect, vi, beforeEach, afterEach, describe } from 'vitest'
import type { MxRecord } from 'node:dns'

const { mockResolveMx } = vi.hoisted(() => ({
  mockResolveMx: vi.fn<typeof import('node:dns/promises').resolveMx>(),
}))

vi.mock<typeof import('node:dns/promises')>(import('node:dns/promises'), async () => {
  type NativeDnsModule = typeof import('node:dns/promises') & {
    default: typeof import('node:dns/promises')
  }
  const actual = await vi.importActual<NativeDnsModule>('node:dns/promises')
  return {
    ...actual,
    default: { ...actual.default, resolveMx: mockResolveMx },
    resolveMx: mockResolveMx,
  }
})

const MX_RECORDS = [{ exchange: 'mx.gmail.com', priority: 10 }]

describe('resolve-mx', () => {
  vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.useRealTimers()
    mockResolveMx.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolveMxRecords returns MX records on first success', async () => {
    mockResolveMx.mockResolvedValueOnce(MX_RECORDS)
    const { resolveMxRecords } = await import('./resolve-mx.mts')

    const result = await resolveMxRecords('gmail.com')
    expect(result).toEqual(MX_RECORDS)
    expect(mockResolveMx).toHaveBeenCalledTimes(1)
  })

  it('resolveMxRecords retries on timeout then succeeds', async () => {
    vi.useFakeTimers()
    const timeout = Promise.withResolvers<MxRecord[]>()
    mockResolveMx
      .mockReturnValueOnce(timeout.promise) // hangs (triggers timeout)
      .mockResolvedValueOnce(MX_RECORDS)
    const { resolveMxRecords } = await import('./resolve-mx.mts')

    const resolution = resolveMxRecords('gmail.com')
    const observed = resolution.catch((err: unknown) => err)
    try {
      await vi.advanceTimersByTimeAsync(5_000)
      const result = await observed
      expect(result).toEqual(MX_RECORDS)
      expect(mockResolveMx).toHaveBeenCalledTimes(2)
    } finally {
      timeout.resolve([])
      await Promise.allSettled([timeout.promise, observed])
    }
  })

  it('resolveMxRecords throws DnsTimeoutError after all retries exhausted', async () => {
    vi.useFakeTimers()
    // All 3 attempts hang
    const timeout = Promise.withResolvers<MxRecord[]>()
    mockResolveMx.mockReturnValue(timeout.promise)
    const { resolveMxRecords, DnsTimeoutError } = await import('./resolve-mx.mts')

    const resolution = resolveMxRecords('gmail.com')
    const rejection = resolution.catch((err: unknown) => err)
    try {
      await vi.advanceTimersByTimeAsync(15_000)
      await expect(rejection).resolves.toBeInstanceOf(DnsTimeoutError)
      expect(mockResolveMx).toHaveBeenCalledTimes(3)
    } finally {
      timeout.resolve([])
      await Promise.allSettled([timeout.promise, rejection])
    }
  })

  it('resolveMxRecords throws immediately on definitive DNS errors without retrying', async () => {
    const nxdomainError = new Error('queryMx ENOTFOUND example.invalid')
    mockResolveMx.mockRejectedValueOnce(nxdomainError)
    const { resolveMxRecords } = await import('./resolve-mx.mts')

    await expect(resolveMxRecords('example.invalid')).rejects.toThrow(nxdomainError)
    expect(mockResolveMx).toHaveBeenCalledTimes(1)
  })

  it('resolveMxRecords retries timeout then throws on definitive error', async () => {
    vi.useFakeTimers()
    const nxdomainError = new Error('queryMx ENOTFOUND example.invalid')
    const timeout = Promise.withResolvers<MxRecord[]>()
    mockResolveMx
      .mockReturnValueOnce(timeout.promise) // timeout
      .mockRejectedValueOnce(nxdomainError) // definitive error
    const { resolveMxRecords } = await import('./resolve-mx.mts')

    const resolution = resolveMxRecords('example.invalid')
    const rejection = resolution.catch((err: unknown) => err)
    try {
      await vi.advanceTimersByTimeAsync(5_000)
      await expect(rejection).resolves.toBe(nxdomainError)
      expect(mockResolveMx).toHaveBeenCalledTimes(2)
    } finally {
      timeout.resolve([])
      await Promise.allSettled([timeout.promise, rejection])
    }
  })
})
