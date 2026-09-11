import { it, expect, vi, beforeEach, afterEach, describe } from 'vitest'

const { mockResolveMx } = vi.hoisted(() => ({
  mockResolveMx: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('node:dns/promises')>(import('node:dns/promises'), () => ({
  resolveMx: mockResolveMx,
}))

const MX_RECORDS = [{ exchange: 'mx.gmail.com', priority: 10 }]

describe('resolve-mx', () => {
  vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.useRealTimers()
    vi.resetModules()
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
    const timeout = new Promise<never>(() => {})
    mockResolveMx
      .mockReturnValueOnce(timeout) // hangs (triggers timeout)
      .mockResolvedValueOnce(MX_RECORDS)
    const { resolveMxRecords } = await import('./resolve-mx.mts')

    const resolution = resolveMxRecords('gmail.com')
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await resolution
    expect(result).toEqual(MX_RECORDS)
    expect(mockResolveMx).toHaveBeenCalledTimes(2)
  })

  it('resolveMxRecords throws DnsTimeoutError after all retries exhausted', async () => {
    vi.useFakeTimers()
    // All 3 attempts hang
    mockResolveMx.mockReturnValue(new Promise<never>(() => {}))
    const { resolveMxRecords, DnsTimeoutError } = await import('./resolve-mx.mts')

    const resolution = resolveMxRecords('gmail.com')
    const rejection = resolution.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(rejection).resolves.toBeInstanceOf(DnsTimeoutError)
    expect(mockResolveMx).toHaveBeenCalledTimes(3)
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
    const timeout = new Promise<never>(() => {})
    mockResolveMx
      .mockReturnValueOnce(timeout) // timeout
      .mockRejectedValueOnce(nxdomainError) // definitive error
    const { resolveMxRecords } = await import('./resolve-mx.mts')

    const resolution = resolveMxRecords('example.invalid')
    const rejection = resolution.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(rejection).resolves.toBe(nxdomainError)
    expect(mockResolveMx).toHaveBeenCalledTimes(2)
  })
})
