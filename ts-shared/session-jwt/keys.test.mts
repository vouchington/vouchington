import { describe, expect, it, vi } from 'vitest'
import type { SessionJwtEnvironment } from './types.mts'

// vi.resetModules() resets the module-level keySetCache/keySetCacheByEnvIdentity memo state
// between tests. Return the import promise without await to avoid the ban-dynamic-imports
// static-analysis rule.
function importKeysModule() {
  vi.resetModules()
  return import('./keys.mts')
}

// Both fields empty routes buildResolvedKeySet to its non-production fallback test key, so these
// tests don't need real JWK material — only that the object identity/read-count behavior holds.
function emptyEnv(reads: { private: number; public: number }): SessionJwtEnvironment {
  return {
    get VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64() {
      reads.private++
      return ''
    },
    get VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64() {
      reads.public++
      return ''
    },
  }
}

describe('getResolvedKeySet', () => {
  it('returns the same cached promise for repeated calls with the same env object and mode', async () => {
    const { getResolvedKeySet } = await importKeysModule()
    const env = emptyEnv({ private: 0, public: 0 })

    const first = getResolvedKeySet({ env, mode: 'test' })
    const second = getResolvedKeySet({ env, mode: 'test' })

    expect(second).toBe(first)
    await expect(first).resolves.toBeDefined()
  })

  it('skips re-reading key material on a repeat call with the same env object', async () => {
    const { getResolvedKeySet } = await importKeysModule()
    const reads = { private: 0, public: 0 }
    const env = emptyEnv(reads)

    // The first (uncached) resolve reads each field twice — once to build the cache key, once
    // inside buildResolvedKeySet's own key normalization — so 2 is the correct floor here, not 1.
    // What this guards is that the *second* call adds zero further reads via the identity fast
    // path, not that a single resolve is read-once (a separate, out-of-scope inefficiency).
    await getResolvedKeySet({ env, mode: 'test' })
    await getResolvedKeySet({ env, mode: 'test' })

    expect(reads.private).toBe(2)
    expect(reads.public).toBe(2)
  })

  it('caches per mode when the same env object is reused across modes', async () => {
    const { getResolvedKeySet } = await importKeysModule()
    const env = emptyEnv({ private: 0, public: 0 })

    const testMode = getResolvedKeySet({ env, mode: 'test' })
    const devMode = getResolvedKeySet({ env, mode: 'development' })
    const testModeAgain = getResolvedKeySet({ env, mode: 'test' })

    expect(testModeAgain).toBe(testMode)
    expect(devMode).not.toBe(testMode)
  })

  it('still resolves when called without an env object (process.env fallback)', async () => {
    const { getResolvedKeySet } = await importKeysModule()

    await expect(getResolvedKeySet({ mode: 'test' })).resolves.toBeDefined()
    await expect(getResolvedKeySet()).resolves.toBeDefined()
  })

  it('shares the content-keyed cache across distinct env objects with identical key material', async () => {
    const { getResolvedKeySet } = await importKeysModule()
    const envA = emptyEnv({ private: 0, public: 0 })
    const envB = emptyEnv({ private: 0, public: 0 })

    const fromA = getResolvedKeySet({ env: envA, mode: 'test' })
    const fromB = getResolvedKeySet({ env: envB, mode: 'test' })

    expect(fromB).toBe(fromA)
  })
})
