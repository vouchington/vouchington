import { it, expect, vi, beforeEach, describe } from 'vitest'
import { upsertUrlHostnames } from './upsert.mts'
import { getTestHostnameDnsStats, setTestHostnameStaleDnsFailures } from '@voucha/test-helpers'
import {
  recordHostnameConfigurationFailure,
  recordHostnameDnsFailure,
  resetHostnameDnsFailures,
} from './dns-failures.mts'

describe('dns-failures', () => {
  const mockCanary = vi.fn<VitestLooseMock>()

  const suffix = Math.random().toString(36).slice(2, 10)
  let hostnameCounter = 0

  function nextHostname(): string {
    hostnameCounter++
    return `dns-fail-${suffix}-${hostnameCounter}.example.com`
  }

  async function makeHostname(): Promise<string> {
    const hostnamesMap = await upsertUrlHostnames(null, [nextHostname()])
    return [...hostnamesMap.values()][0]!
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCanary.mockResolvedValue(undefined)
  })

  it('recordHostnameDnsFailure increments counter on first failure', async () => {
    const id = await makeHostname()

    await recordHostnameDnsFailure(id, mockCanary)

    const row = await getTestHostnameDnsStats(id)
    expect(row!.consecutive_dns_failures).toBe(1)
    expect(row!.last_dns_failure_at).toBeInstanceOf(Date)
    expect(row!.dns_disabled_at).toBeNull()
    expect(row!.crawlable).not.toBe(false)
  })

  it('recordHostnameDnsFailure increments counter on second failure', async () => {
    const id = await makeHostname()

    await recordHostnameDnsFailure(id, mockCanary)
    await recordHostnameDnsFailure(id, mockCanary)

    const row = await getTestHostnameDnsStats(id)
    expect(row!.consecutive_dns_failures).toBe(2)
    expect(row!.dns_disabled_at).toBeNull()
  })

  it('recordHostnameDnsFailure disables hostname on third failure', async () => {
    const id = await makeHostname()

    await recordHostnameDnsFailure(id, mockCanary)
    await recordHostnameDnsFailure(id, mockCanary)
    await recordHostnameDnsFailure(id, mockCanary)

    const row = await getTestHostnameDnsStats(id)
    expect(row!.consecutive_dns_failures).toBe(3)
    expect(row!.crawlable).toBe(false)
    expect(row!.dns_disabled_at).toBeInstanceOf(Date)
  })

  it('recordHostnameDnsFailure does not re-stamp dns_disabled_at when already disabled', async () => {
    const id = await makeHostname()

    await recordHostnameDnsFailure(id, mockCanary)
    await recordHostnameDnsFailure(id, mockCanary)
    await recordHostnameDnsFailure(id, mockCanary)
    const firstRow = await getTestHostnameDnsStats(id)
    const firstDisabledAt = firstRow!.dns_disabled_at

    // Fourth call: counter continues to increment but dns_disabled_at stays the same
    await recordHostnameDnsFailure(id, mockCanary)
    const row = await getTestHostnameDnsStats(id)
    expect(row!.consecutive_dns_failures).toBe(4)
    expect(row!.dns_disabled_at).toEqual(firstDisabledAt)
  })

  it('recordHostnameDnsFailure resets counter to 1 when last_dns_failure_at is stale (>7 days)', async () => {
    const id = await makeHostname()

    // Simulate 2 old failures from 8 days ago
    await setTestHostnameStaleDnsFailures(id, 2)

    await recordHostnameDnsFailure(id, mockCanary)

    const row = await getTestHostnameDnsStats(id)
    // Counter must reset to 1, not increment to 3
    expect(row!.consecutive_dns_failures).toBe(1)
    expect(row!.dns_disabled_at).toBeNull()
    expect(row!.crawlable).not.toBe(false)
  })

  it('recordHostnameDnsFailure does nothing when canary DNS fails', async () => {
    const id = await makeHostname()

    mockCanary.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND cloudflare.com'))

    await recordHostnameDnsFailure(id, mockCanary)

    const row = await getTestHostnameDnsStats(id)
    expect(row!.consecutive_dns_failures).toBe(0)
    expect(row!.last_dns_failure_at).toBeNull()
    expect(row!.dns_disabled_at).toBeNull()
  })

  it('recordHostnameConfigurationFailure increments counter without DNS canary', async () => {
    const id = await makeHostname()

    await recordHostnameConfigurationFailure(id)

    const row = await getTestHostnameDnsStats(id)
    expect(row!.consecutive_dns_failures).toBe(1)
    expect(row!.last_dns_failure_at).toBeInstanceOf(Date)
    expect(mockCanary).not.toHaveBeenCalled()
  })

  it('recordHostnameConfigurationFailure disables hostname on third failure', async () => {
    const id = await makeHostname()

    await recordHostnameConfigurationFailure(id)
    await recordHostnameConfigurationFailure(id)
    await recordHostnameConfigurationFailure(id)

    const row = await getTestHostnameDnsStats(id)
    expect(row!.consecutive_dns_failures).toBe(3)
    expect(row!.crawlable).toBe(false)
    expect(row!.dns_disabled_at).toBeInstanceOf(Date)
  })

  it('resetHostnameDnsFailures resets counter to 0', async () => {
    const id = await makeHostname()

    await recordHostnameDnsFailure(id, mockCanary)
    await recordHostnameDnsFailure(id, mockCanary)

    await resetHostnameDnsFailures(id)

    const row = await getTestHostnameDnsStats(id)
    expect(row!.consecutive_dns_failures).toBe(0)
  })

  it('resetHostnameDnsFailures is a no-op when counter is already 0', async () => {
    const id = await makeHostname()

    await expect(resetHostnameDnsFailures(id)).resolves.toBeUndefined()

    const row = await getTestHostnameDnsStats(id)
    expect(row!.consecutive_dns_failures).toBe(0)
  })
})
