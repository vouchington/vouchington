import { it, expect, describe } from 'vitest'
import { resolveDnsCanary } from './dns-canary.mts'

describe('dns-canary', () => {
  // Skip in CI — real DNS lookups are unreliable in isolated CI environments.
  it.skipIf(process.env.CI === 'true')(
    'resolveDnsCanary resolves successfully against well-known hostnames',
    async () => {
      await expect(resolveDnsCanary()).resolves.toBeUndefined()
    },
  )
})
