import { describe, expect, it } from 'vitest'

import { getDeployEnvironment, isDeployedEnvironment, isProductionEnvironment } from './index.mts'

describe('getDeployEnvironment', () => {
  it('prefers ENVIRONMENT over NODE_ENV', () => {
    expect(getDeployEnvironment({ ENVIRONMENT: 'staging', NODE_ENV: 'production' })).toBe('staging')
    expect(getDeployEnvironment({ ENVIRONMENT: 'production', NODE_ENV: 'production' })).toBe(
      'production',
    )
  })

  it('falls back to NODE_ENV when ENVIRONMENT is unset', () => {
    expect(getDeployEnvironment({ NODE_ENV: 'production' })).toBe('production')
    expect(getDeployEnvironment({ NODE_ENV: 'test' })).toBe('test')
  })

  it('falls back to development when neither is set', () => {
    expect(getDeployEnvironment({})).toBe('development')
  })

  it('falls back to NODE_ENV when ENVIRONMENT is set but unrecognized', () => {
    // A garbled ENVIRONMENT must not be trusted, but it also must not blind the accessor to
    // NODE_ENV=production, which ECS sets unconditionally on every deployed task regardless of
    // what happens to ENVIRONMENT — that fallback is what keeps IS_DEPLOYED fail-safe (true) if
    // ENVIRONMENT is ever corrupted on a real deployed box, matching isDeployedEnvironment's
    // documented NODE_ENV=production fallback below.
    expect(getDeployEnvironment({ ENVIRONMENT: 'prodution', NODE_ENV: 'production' })).toBe(
      'production',
    )
  })

  it('falls back to development when both ENVIRONMENT and NODE_ENV are unrecognized', () => {
    expect(getDeployEnvironment({ ENVIRONMENT: 'prodution', NODE_ENV: 'nonsense' })).toBe(
      'development',
    )
  })

  it('treats an empty or whitespace-only ENVIRONMENT as unset, falling back to NODE_ENV', () => {
    expect(getDeployEnvironment({ ENVIRONMENT: '', NODE_ENV: 'staging' })).toBe('staging')
    expect(getDeployEnvironment({ ENVIRONMENT: '   ', NODE_ENV: 'production' })).toBe('production')
  })

  it('never throws on an unrecognized value', () => {
    expect(() => getDeployEnvironment({ ENVIRONMENT: 'nonsense' })).not.toThrow()
  })

  it('defaults to process.env when no source is given', () => {
    expect(getDeployEnvironment()).not.toBeUndefined()
  })
})

describe('isDeployedEnvironment', () => {
  it('is true for staging and production', () => {
    expect(isDeployedEnvironment({ ENVIRONMENT: 'staging' })).toBe(true)
    expect(isDeployedEnvironment({ ENVIRONMENT: 'production' })).toBe(true)
  })

  it('is false for development and test', () => {
    expect(isDeployedEnvironment({ ENVIRONMENT: 'development' })).toBe(false)
    expect(isDeployedEnvironment({ ENVIRONMENT: 'test' })).toBe(false)
    expect(isDeployedEnvironment({})).toBe(false)
  })

  it('falls back to NODE_ENV=production only when ENVIRONMENT is unset', () => {
    // On real ECS tasks ENVIRONMENT is always set (staging|production), so this fallback path is
    // only reachable on developer laptops or CI jobs that never set ENVIRONMENT — it is not the
    // path that discriminates staging from production; ENVIRONMENT is.
    expect(isDeployedEnvironment({ NODE_ENV: 'production' })).toBe(true)
  })
})

describe('isProductionEnvironment', () => {
  it('is true only for production', () => {
    expect(isProductionEnvironment({ ENVIRONMENT: 'production' })).toBe(true)
    expect(isProductionEnvironment({ ENVIRONMENT: 'staging' })).toBe(false)
    expect(isProductionEnvironment({ ENVIRONMENT: 'development' })).toBe(false)
    expect(isProductionEnvironment({ ENVIRONMENT: 'test' })).toBe(false)
  })

  it('distinguishes staging from production via ENVIRONMENT even when NODE_ENV is production on both', () => {
    expect(isProductionEnvironment({ ENVIRONMENT: 'staging', NODE_ENV: 'production' })).toBe(false)
    expect(isProductionEnvironment({ ENVIRONMENT: 'production', NODE_ENV: 'production' })).toBe(
      true,
    )
  })
})
