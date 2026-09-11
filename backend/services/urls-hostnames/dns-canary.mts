import dns from 'node:dns/promises'

/**
 * Well-known, highly-reliable hostnames used to probe whether our server's DNS
 * resolver is functional. A failure here means our own DNS is broken, not the
 * target host.
 */
const CANARY_HOSTNAMES = ['cloudflare.com', 'one.one.one.one', 'dns.google']

let canaryIndex = 0

/**
 * Resolves a canary hostname to check whether our server's DNS resolver is working.
 * Rotates through a list of well-known hostnames on each call.
 *
 * Throws if the DNS lookup fails (resolver is down or unreachable).
 */
/* no-mistakes: integration=http */
export async function resolveDnsCanary(): Promise<void> {
  const hostname = CANARY_HOSTNAMES[canaryIndex % CANARY_HOSTNAMES.length]!
  canaryIndex++
  await dns.lookup(hostname)
}
