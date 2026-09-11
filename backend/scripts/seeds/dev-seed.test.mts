import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertNotProdOrStaging } from './dev-seed.mts'

describe('assertNotProdOrStaging', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns false and writes error to stderr for production', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const result = assertNotProdOrStaging('production')

    expect(result).toBe(false)
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('db:seed must not run in production'),
      expect.any(Function),
    )
  })

  it('returns false and writes error to stderr for staging', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const result = assertNotProdOrStaging('staging')

    expect(result).toBe(false)
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('db:seed must not run in staging'),
      expect.any(Function),
    )
  })

  it('returns true for development', () => {
    expect(assertNotProdOrStaging('development')).toBe(true)
  })

  it('returns true when env is undefined', () => {
    expect(assertNotProdOrStaging(undefined)).toBe(true)
  })
})
