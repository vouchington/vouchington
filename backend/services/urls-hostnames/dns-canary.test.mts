import { it, expect, describe } from 'vitest'
import { resolveDnsCanary } from './dns-canary.mts'

describe('dns-canary', () => {
  it('resolveDnsCanary resolves a reserved hostname', async () => {
    await expect(resolveDnsCanary('example.com')).resolves.toBeUndefined()
    await expect(resolveDnsCanary('example.net')).resolves.toBeUndefined()
    await expect(resolveDnsCanary('example.org')).resolves.toBeUndefined()
  })
})
