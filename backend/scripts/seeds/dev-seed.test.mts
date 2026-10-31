import { afterEach, describe, expect, it, vi } from 'vitest'
import { devSeedAllowed } from './dev-seed-guard.mts'

describe('dev seed entry', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('writes the production refusal when the entry loads', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    await import('./dev-seed.mts')

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('db:seed must not run in production'),
      expect.any(Function),
    )
  })

  it('writes the staging refusal when the entry loads', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NODE_ENV', 'staging')
    vi.resetModules()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    await import('./dev-seed.mts')

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('db:seed must not run in staging'),
      expect.any(Function),
    )
  })

  it('returns true for development', () => {
    expect(devSeedAllowed('development')).toBe(true)
  })

  it('returns true when env is undefined', () => {
    expect(devSeedAllowed(undefined)).toBe(true)
  })
})
