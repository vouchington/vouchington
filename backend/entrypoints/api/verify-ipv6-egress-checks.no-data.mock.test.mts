import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockResolve4, mockResolve6 } = vi.hoisted(() => ({
  mockResolve4: vi.fn<VitestLooseMock>(),
  mockResolve6: vi.fn<VitestLooseMock>(),
}))
vi.mock<typeof import('node:dns/promises')>(import('node:dns/promises'), () => ({
  resolve4: mockResolve4,
  resolve6: mockResolve6,
}))

const { mockNetworkInterfaces } = vi.hoisted(() => ({
  mockNetworkInterfaces: vi.fn<VitestLooseMock>(),
}))
vi.mock<typeof import('node:os')>(import('node:os'), () => ({
  networkInterfaces: mockNetworkInterfaces,
}))

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const IPV6_ONLY_INTERFACES = {
  eth0: [
    { address: '127.0.0.1', family: 'IPv4', internal: true },
    { address: '2600:1f18::1', family: 'IPv6', internal: false },
  ],
}

describe('verify-ipv6-egress-checks', () => {
  beforeEach(() => {
    vi.resetModules()
    mockResolve4.mockReset()
    mockResolve6.mockReset()
    mockNetworkInterfaces.mockReset()
    fetchSpy.mockReset()
  })

  describe('reportRouteEvidence', () => {
    it('does not throw when the task has only a non-loopback IPv6 address', async () => {
      mockNetworkInterfaces.mockReturnValueOnce(IPV6_ONLY_INTERFACES)
      const { reportRouteEvidence } = await import('./verify-ipv6-egress-checks.mts')

      expect(() => reportRouteEvidence()).not.toThrow()
    })

    it('throws when the task has a non-loopback IPv4 address', async () => {
      mockNetworkInterfaces.mockReturnValueOnce({
        eth0: [
          { address: '10.0.1.5', family: 'IPv4', internal: false },
          { address: '2600:1f18::1', family: 'IPv6', internal: false },
        ],
      })
      const { reportRouteEvidence } = await import('./verify-ipv6-egress-checks.mts')

      expect(() => reportRouteEvidence()).toThrow(
        'Task has a non-loopback IPv4 address; this task is not IPv6-only.',
      )
    })

    // Reproduces the exact interface shape observed on a real IPv6-only Fargate task
    // (voucha-staging-ecs-ipv6-a/b, both Ipv6Native with no IPv4 CIDR at all): AWS still assigns
    // eth0 an auto-generated 169.254.0.0/16 link-local address, reported as `internal: false`.
    it('does not throw when the only non-loopback IPv4 is an AWS link-local address', async () => {
      mockNetworkInterfaces.mockReturnValueOnce({
        eth0: [
          { address: '169.254.172.2', family: 'IPv4', internal: false },
          { address: '2600:1f14:3e90:ff15:a819:fba4:28cb:3de7', family: 'IPv6', internal: false },
        ],
      })
      const { reportRouteEvidence } = await import('./verify-ipv6-egress-checks.mts')

      expect(() => reportRouteEvidence()).not.toThrow()
    })

    it('throws when the task has no non-loopback IPv6 address', async () => {
      mockNetworkInterfaces.mockReturnValueOnce({
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      })
      const { reportRouteEvidence } = await import('./verify-ipv6-egress-checks.mts')

      expect(() => reportRouteEvidence()).toThrow('Task has no non-loopback IPv6 address.')
    })
  })

  describe('resolveRecords', () => {
    it('returns resolved A and AAAA records', async () => {
      mockResolve4.mockResolvedValueOnce(['1.2.3.4'])
      mockResolve6.mockResolvedValueOnce(['2600::1'])
      const { resolveRecords } = await import('./verify-ipv6-egress-checks.mts')

      await expect(resolveRecords('example.com')).resolves.toEqual({
        a: ['1.2.3.4'],
        aaaa: ['2600::1'],
      })
    })

    it('falls back to an empty array when resolve4 rejects', async () => {
      mockResolve4.mockRejectedValueOnce(new Error('ENOTFOUND'))
      mockResolve6.mockResolvedValueOnce(['2600::1'])
      const { resolveRecords } = await import('./verify-ipv6-egress-checks.mts')

      await expect(resolveRecords('example.com')).resolves.toEqual({
        a: [],
        aaaa: ['2600::1'],
      })
    })

    it('falls back to an empty array when resolve6 rejects', async () => {
      mockResolve4.mockResolvedValueOnce(['1.2.3.4'])
      mockResolve6.mockRejectedValueOnce(new Error('ENOTFOUND'))
      const { resolveRecords } = await import('./verify-ipv6-egress-checks.mts')

      await expect(resolveRecords('example.com')).resolves.toEqual({
        a: ['1.2.3.4'],
        aaaa: [],
      })
    })
  })

  describe('checkTlsReachable', () => {
    it('returns tlsReachable true on any HTTP response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 403 }))
      const { checkTlsReachable } = await import('./verify-ipv6-egress-checks.mts')

      await expect(checkTlsReachable('example.com')).resolves.toEqual({ tlsReachable: true })
    })

    it('returns tlsReachable false with the error message when fetch throws an Error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      const { checkTlsReachable } = await import('./verify-ipv6-egress-checks.mts')

      await expect(checkTlsReachable('example.com')).resolves.toEqual({
        tlsReachable: false,
        tlsError: 'connect ECONNREFUSED',
      })
    })

    it('returns tlsReachable false with a stringified error when fetch throws a non-Error', async () => {
      fetchSpy.mockRejectedValueOnce('aborted')
      const { checkTlsReachable } = await import('./verify-ipv6-egress-checks.mts')

      await expect(checkTlsReachable('example.com')).resolves.toEqual({
        tlsReachable: false,
        tlsError: 'aborted',
      })
    })
  })

  describe('runIpv6EgressVerification', () => {
    it('reports no failures when every host resolves AAAA and is TLS-reachable', async () => {
      mockNetworkInterfaces.mockReturnValueOnce(IPV6_ONLY_INTERFACES)
      mockResolve4.mockResolvedValue(['1.2.3.4'])
      mockResolve6.mockResolvedValue(['2600::1'])
      fetchSpy.mockResolvedValue(new Response(null, { status: 200 }))
      const { runIpv6EgressVerification, HOSTS } = await import('./verify-ipv6-egress-checks.mts')

      const outcome = await runIpv6EgressVerification()

      expect(outcome.results).toHaveLength(HOSTS.length)
      expect(outcome.failures).toEqual([])
    })

    it('collects a failure for a host with no AAAA record', async () => {
      mockNetworkInterfaces.mockReturnValueOnce(IPV6_ONLY_INTERFACES)
      mockResolve4.mockResolvedValue(['1.2.3.4'])
      mockResolve6.mockResolvedValueOnce([]).mockResolvedValue(['2600::1'])
      fetchSpy.mockResolvedValue(new Response(null, { status: 200 }))
      const { runIpv6EgressVerification, HOSTS } = await import('./verify-ipv6-egress-checks.mts')

      const outcome = await runIpv6EgressVerification()

      expect(outcome.results).toHaveLength(HOSTS.length)
      expect(outcome.failures).toHaveLength(1)
      expect(outcome.failures[0]?.host).toBe(HOSTS[0])
    })

    it('collects a failure for a host that is not TLS-reachable', async () => {
      mockNetworkInterfaces.mockReturnValueOnce(IPV6_ONLY_INTERFACES)
      mockResolve4.mockResolvedValue(['1.2.3.4'])
      mockResolve6.mockResolvedValue(['2600::1'])
      fetchSpy
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
        .mockResolvedValue(new Response(null, { status: 200 }))
      const { runIpv6EgressVerification, HOSTS } = await import('./verify-ipv6-egress-checks.mts')

      const outcome = await runIpv6EgressVerification()

      expect(outcome.results).toHaveLength(HOSTS.length)
      expect(outcome.failures).toHaveLength(1)
      expect(outcome.failures[0]?.host).toBe(HOSTS[0])
      expect(outcome.failures[0]?.tlsReachable).toBe(false)
    })

    it('propagates the reportRouteEvidence throw when the task is not IPv6-only', async () => {
      mockNetworkInterfaces.mockReturnValueOnce({
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      })
      const { runIpv6EgressVerification } = await import('./verify-ipv6-egress-checks.mts')

      await expect(runIpv6EgressVerification()).rejects.toThrow(
        'Task has no non-loopback IPv6 address.',
      )
    })
  })
})
