import { describe, it, expect } from 'vitest'
import { fetchWithPinnedDns } from './pinned-fetch.mts'
import { HttpOperationError } from '../errors.mts'

// Integration test against the REAL ssrf-guard library (no mocks): proves our
// pinned-fetch wrapper + BLOCKED_HOSTNAME_POLICY actually reject SSRF targets.
// Every case below is blocked synchronously inside ssrf-guard's validateUrl —
// IP literals via the pre-DNS `net.isIP && isPrivateIp` check, and the policy
// hostnames via the pre-DNS blocked-hostname check — so no DNS or network I/O
// happens and the test is deterministic offline.
//
// Exhaustive range sweeps, legacy decimal/octal/hex literals (those reach
// dns.lookup), DNS rebinding, and per-hop redirect re-validation are
// ssrf-guard-owned and covered by that package's own suite, not re-tested here.
describe('fetchWithPinnedDns (real ssrf-guard)', () => {
  const signal = AbortSignal.timeout(5000)

  it.each([
    ['cloud metadata IPv4', 'http://169.254.169.254/'],
    ['IPv4 loopback', 'http://127.0.0.1/'],
    ['IPv4 private 10/8', 'http://10.0.0.1/'],
    ['IPv4 this-network 0/8', 'http://0.0.0.0/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['IPv6 link-local', 'http://[fe80::1]/'],
    ['IPv4-mapped IPv6 loopback', 'http://[::ffff:127.0.0.1]/'],
    ['blocked hostname localhost', 'http://localhost/'],
    ['blocked subdomain *.localhost', 'http://foo.localhost/'],
    ['blocked metadata.google.internal', 'http://metadata.google.internal/'],
  ])('blocks %s (%s) with HttpOperationError(403)', async (_label, url) => {
    const err = await fetchWithPinnedDns(url, signal).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(HttpOperationError)
    expect((err as HttpOperationError).statusCode).toBe(403)
  })
})
