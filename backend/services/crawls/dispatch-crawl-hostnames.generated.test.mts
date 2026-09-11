import { describe, it, expect } from 'vitest'
import { dispatchCrawlHostnames } from './dispatch-crawl-hostnames.mts'
import {
  insertTestUrlHostname,
  isHostnameDispatchable,
} from '@voucha/test-helpers/entities/url-hostnames'
import { insertTestDomainBlacklist } from '@voucha/test-helpers/entities/domain-blacklists'

describe('dispatchCrawlHostnames', () => {
  it('should not dispatch hostnames that are in the domain blacklist', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const blockedHostname = `blacklisted-${random}.example.com`
    const crawlableHostname = `crawlable-${random}.example.com`

    // Create both hostnames as crawlable and not blocked
    await insertTestUrlHostname({
      hostname: blockedHostname,
      crawlable: true,
      blocked: false,
    })
    await insertTestUrlHostname({
      hostname: crawlableHostname,
      crawlable: true,
      blocked: false,
    })
    // Add one to the domain blacklist
    await insertTestDomainBlacklist(blockedHostname)

    // Verify the blacklisted hostname is excluded from the dispatch query
    expect(await isHostnameDispatchable(blockedHostname)).toBe(false)

    // Verify the crawlable hostname is still included
    expect(await isHostnameDispatchable(crawlableHostname)).toBe(true)

    // Dispatch should work without errors
    const total = await dispatchCrawlHostnames()
    expect(total).toBeGreaterThanOrEqual(1)
  })

  it('should not dispatch hostnames with blocked=true', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostname = `blocked-${random}.example.com`

    await insertTestUrlHostname({
      hostname,
      crawlable: true,
      blocked: true,
    })
    // Verify the blocked hostname is excluded
    expect(await isHostnameDispatchable(hostname)).toBe(false)
  })

  it('should not dispatch hostnames with crawlable=false', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostname = `uncrawlable-${random}.example.com`

    await insertTestUrlHostname({
      hostname,
      crawlable: false,
      blocked: false,
    })
    // Verify the uncrawlable hostname is excluded
    expect(await isHostnameDispatchable(hostname)).toBe(false)
  })
})
