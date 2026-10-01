import { randomUUID } from 'node:crypto'
import dns from 'node:dns'
import { describe, expect, it, vi } from 'vitest'
import { fetchRemoteActorDocument } from '../fetch-remote-actor-document.mts'

describe('fetchRemoteActorDocument resolver failures', () => {
  it('preserves an unexpected resolver failure instead of allowing an availability fallback', async () => {
    const hostname = `actor-${randomUUID()}.example.com`
    const err = new TypeError('Owned resolver returned an unexpected failure')
    const originalLookup = dns.promises.lookup
    const lookup = vi.fn<VitestLooseMock>(async (requestedHostname: string, options?: unknown) => {
      if (requestedHostname === hostname) throw err
      return Reflect.apply(originalLookup, dns.promises, [requestedHostname, options])
    })
    const lookupSpy = vi.spyOn(dns.promises, 'lookup').mockImplementation(lookup)
    try {
      await expect(fetchRemoteActorDocument(`https://${hostname}/users/owned`)).rejects.toBe(err)
      expect(lookup).toHaveBeenCalledWith(hostname, expect.objectContaining({ all: true }))
    } finally {
      lookupSpy.mockRestore()
    }
  })
})
