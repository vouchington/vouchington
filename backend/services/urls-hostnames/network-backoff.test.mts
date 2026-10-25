import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import {
  expireTestHostnameNetworkBackoff,
  getTestHostnameNetworkBackoff,
} from '@voucha/test-helpers'
import { CrawlerNetworkError, CrawlerServerError } from '@modules/on-error/errors'
import { upsertUrlHostnames } from './upsert.mts'
import { recordHostnameDnsFailure } from './dns-failures.mts'
import {
  NETWORK_BACKOFF_FAILURE_THRESHOLD,
  NETWORK_BACKOFF_MAX_STEP,
  claimHostnameNetworkProbe,
  getNetworkBackoffDurationMs,
  isHostnameAnsweredError,
  isHostnameUnreachableError,
  isOutsideHostnameNetworkBackoff,
  recordHostnameNetworkFailure,
  resetHostnameFailures,
} from './network-backoff.mts'

describe('network-backoff', () => {
  let analyticsDir: string

  beforeAll(async () => {
    analyticsDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'network-backoff-test-'))
    vi.stubEnv('ANALYTICS_LOCAL_DIR', analyticsDir)
    vi.stubEnv('ANALYTICS_BACKEND', 'local')
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await fs.promises.rm(analyticsDir, { recursive: true })
  })

  async function makeHostname() {
    const hostname = `net-backoff-${crypto.randomUUID()}.example.com`
    const hostnames = await upsertUrlHostnames(null, [hostname])
    return { id: [...hostnames.values()][0]!, hostname }
  }

  async function failTimes(id: string, times: number) {
    for (let i = 0; i < times; i++) await recordHostnameNetworkFailure(id, 'html')
  }

  async function backoffEvents(hostname: string) {
    await flush()
    return query(
      `SELECT event_type, retry_after_ms, success FROM crawler_requests WHERE domain = '${hostname}' ORDER BY event_time`,
    )
  }

  it('opens at the threshold without touching crawlability', async () => {
    const { id, hostname } = await makeHostname()

    await failTimes(id, NETWORK_BACKOFF_FAILURE_THRESHOLD - 1)
    expect((await getTestHostnameNetworkBackoff(id))!.network_backoff_step).toBe(0)

    await recordHostnameNetworkFailure(id, 'html')
    const row = (await getTestHostnameNetworkBackoff(id))!
    expect(row.network_backoff_step).toBe(1)
    expect(row.consecutive_network_failures).toBe(0)
    expect(row.network_backoff_until!.getTime()).toBeGreaterThan(Date.now())
    expect(row.is_crawlable).toBe(true)
    expect(await isOutsideHostnameNetworkBackoff({ id, ...row })).toBe(false)

    const events = await backoffEvents(hostname)
    expect(events.map(event => event.event_type)).toEqual(['network_backoff_opened'])
    expect(Number(events[0]!.retry_after_ms)).toBe(getNetworkBackoffDurationMs(1))
  })

  it('restarts the count when the hostname answers in between', async () => {
    const { id } = await makeHostname()

    await failTimes(id, NETWORK_BACKOFF_FAILURE_THRESHOLD - 1)
    await resetHostnameFailures(id, { crawlerType: 'html', includeDns: false })
    await failTimes(id, NETWORK_BACKOFF_FAILURE_THRESHOLD - 1)

    const row = (await getTestHostnameNetworkBackoff(id))!
    expect(row.network_backoff_step).toBe(0)
    expect(row.consecutive_network_failures).toBe(NETWORK_BACKOFF_FAILURE_THRESHOLD - 1)
  })

  it('ignores failures from in-flight jobs while the backoff is open', async () => {
    const { id } = await makeHostname()
    await failTimes(id, NETWORK_BACKOFF_FAILURE_THRESHOLD)
    const opened = (await getTestHostnameNetworkBackoff(id))!

    await failTimes(id, NETWORK_BACKOFF_FAILURE_THRESHOLD)

    expect(await getTestHostnameNetworkBackoff(id)).toEqual(opened)
  })

  it('lets exactly one caller claim the probe after expiry', async () => {
    const { id } = await makeHostname()
    await failTimes(id, NETWORK_BACKOFF_FAILURE_THRESHOLD)
    expect(await claimHostnameNetworkProbe(id)).toBe(false)
    await expireTestHostnameNetworkBackoff(id)

    const claims = await Promise.all(Array.from({ length: 5 }, () => claimHostnameNetworkProbe(id)))

    expect(claims.filter(Boolean)).toHaveLength(1)
    const row = (await getTestHostnameNetworkBackoff(id))!
    expect(row.network_backoff_probe_claimed_at).toBeInstanceOf(Date)
    expect(await isOutsideHostnameNetworkBackoff({ id, ...row })).toBe(false)
  })

  it('reopens a failed probe at the next step, capped', async () => {
    const { id, hostname } = await makeHostname()
    await failTimes(id, NETWORK_BACKOFF_FAILURE_THRESHOLD)

    for (let step = 2; step <= NETWORK_BACKOFF_MAX_STEP + 1; step++) {
      await expireTestHostnameNetworkBackoff(id)
      expect(await claimHostnameNetworkProbe(id)).toBe(true)
      await recordHostnameNetworkFailure(id, 'html')
      const row = (await getTestHostnameNetworkBackoff(id))!
      expect(row.network_backoff_step).toBe(Math.min(step, NETWORK_BACKOFF_MAX_STEP))
      expect(row.network_backoff_probe_claimed_at).toBeNull()
      expect(row.network_backoff_until!.getTime()).toBeGreaterThan(
        Date.now() + getNetworkBackoffDurationMs(Math.min(step, NETWORK_BACKOFF_MAX_STEP)) / 2,
      )
    }

    const durations = (await backoffEvents(hostname)).map(event => Number(event.retry_after_ms))
    expect(durations).toEqual([1, 2, 3, 4, 5, 5].map(getNetworkBackoffDurationMs))
  })

  it('closes on reset and reports the closed backoff', async () => {
    const { id, hostname } = await makeHostname()
    await failTimes(id, NETWORK_BACKOFF_FAILURE_THRESHOLD)
    await expireTestHostnameNetworkBackoff(id)
    await claimHostnameNetworkProbe(id)

    await resetHostnameFailures(id, { crawlerType: 'html', includeDns: true })

    const row = (await getTestHostnameNetworkBackoff(id))!
    expect(row).toMatchObject({
      consecutive_network_failures: 0,
      network_backoff_step: 0,
      network_backoff_until: null,
      network_backoff_probe_claimed_at: null,
    })
    expect(await isOutsideHostnameNetworkBackoff({ id, ...row })).toBe(true)
    const events = await backoffEvents(hostname)
    expect(events.map(event => [event.event_type, String(event.success)])).toEqual([
      ['network_backoff_opened', 'false'],
      ['network_backoff_closed', 'true'],
    ])
    expect(Number(events[1]!.retry_after_ms)).toBe(getNetworkBackoffDurationMs(1))
  })

  it('resets the DNS counter only for a successful crawl or fetch', async () => {
    const { id } = await makeHostname()
    const canary = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    await recordHostnameDnsFailure(id, canary)

    await resetHostnameFailures(id, { crawlerType: 'html', includeDns: false })
    expect((await getTestHostnameNetworkBackoff(id))!.consecutive_dns_failures).toBe(1)

    await resetHostnameFailures(id, { crawlerType: 'html', includeDns: true })
    expect((await getTestHostnameNetworkBackoff(id))!.consecutive_dns_failures).toBe(0)
  })

  it('classifies only non-DNS, non-TLS-hostname network errors as unreachable', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    const dns = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    const tls = Object.assign(new Error('altname'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' })
    const url = 'https://example.com/'

    expect(isHostnameUnreachableError(new CrawlerNetworkError(url, 1, refused))).toBe(true)
    expect(isHostnameUnreachableError(new CrawlerNetworkError(url, 1, dns))).toBe(false)
    expect(isHostnameUnreachableError(new CrawlerNetworkError(url, 1, tls))).toBe(false)
    expect(isHostnameAnsweredError(new CrawlerNetworkError(url, 1, refused))).toBe(false)
    expect(isHostnameAnsweredError(new CrawlerServerError(url, 503, 1))).toBe(true)
  })
})
