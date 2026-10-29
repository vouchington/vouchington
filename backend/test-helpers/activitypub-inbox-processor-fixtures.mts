import dns from 'node:dns'
import { vi } from 'vitest'

export function stubUnresolvableHostname(hostname: string) {
  const originalLookup = dns.promises.lookup
  return vi.spyOn(dns.promises, 'lookup').mockImplementation(((
    requested: string,
    options?: unknown,
  ) => {
    if (requested === hostname) {
      const err: NodeJS.ErrnoException = new Error(`getaddrinfo ENOTFOUND ${hostname}`)
      err.code = 'ENOTFOUND'
      return Promise.reject(err)
    }
    return Reflect.apply(originalLookup, dns.promises, [requested, options])
  }) as typeof dns.promises.lookup)
}
