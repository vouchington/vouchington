import dns from 'node:dns/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDnsCanary } from './dns-canary.mts'

describe('resolveDnsCanary', () => {
  const lookup = vi.spyOn(dns, 'lookup')

  beforeEach(() => {
    lookup.mockResolvedValue({ address: '127.0.0.1', family: 4 })
  })

  afterEach(() => {
    lookup.mockReset()
  })

  it('rotates through the canary hostnames, probing a caller hostname without advancing', async () => {
    await resolveDnsCanary()
    await resolveDnsCanary()
    await resolveDnsCanary('example.com')
    await resolveDnsCanary()
    await resolveDnsCanary()

    expect(lookup.mock.calls.map(([hostname]) => hostname)).toEqual([
      'cloudflare.com',
      'one.one.one.one',
      'example.com',
      'dns.google',
      'cloudflare.com',
    ])
  })

  it('rejects when the lookup fails', async () => {
    lookup.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'))

    await expect(resolveDnsCanary()).rejects.toThrow('ENOTFOUND')
  })
})
