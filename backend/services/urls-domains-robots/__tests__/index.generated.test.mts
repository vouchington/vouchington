import { it, expect, describe } from 'vitest'
import { fetchRobotsTxtCached, isUrlCrawlable } from '../index.mts'
import { insertTestDomainBlacklist } from '@voucha/test-helpers'
import { addDomainsToBloomFilter } from '@services/urls-domains-blacklist/bloom-filter'

// example.com, example.net, and example.org answer /robots.txt with HTTP 404.
// fetchRobotsTxtCached turns that into this permissive body.
const PERMISSIVE_ROBOTS_TXT = 'User-agent: *\nAllow: /'

describe('index.generated', () => {
  it('fetchRobotsTxtCached returns the permissive body for example.com', async () => {
    await expect(fetchRobotsTxtCached('example.com')).resolves.toBe(PERMISSIVE_ROBOTS_TXT)
  })

  it('fetchRobotsTxtCached repeats the permissive body for example.net', async () => {
    const first = await fetchRobotsTxtCached('example.net')
    const second = await fetchRobotsTxtCached('example.net')
    expect(first).toBe(PERMISSIVE_ROBOTS_TXT)
    expect(second).toBe(first)
  })

  it('isUrlCrawlable returns true for an example.org path', async () => {
    await expect(isUrlCrawlable('https://example.org/research', 'MyBot/1.0')).resolves.toBe(true)
  })

  it('isUrlCrawlable returns true for an example.com path a stricter robots.txt might block', async () => {
    await expect(isUrlCrawlable('https://example.com/admin', 'MyBot/1.0')).resolves.toBe(true)
  })

  it('isUrlCrawlable allows every user agent when example.net has no robots rules', async () => {
    const url = 'https://example.net/guide'
    await expect(isUrlCrawlable(url, 'Googlebot/2.1')).resolves.toBe(true)
    await expect(isUrlCrawlable(url, 'MyCustomBot/1.0')).resolves.toBe(true)
  })

  it('isUrlCrawlable allows each reserved example domain', async () => {
    await expect(isUrlCrawlable('https://example.com/', 'MyBot/1.0')).resolves.toBe(true)
    await expect(isUrlCrawlable('https://example.net/', 'MyBot/1.0')).resolves.toBe(true)
    await expect(isUrlCrawlable('https://example.org/', 'MyBot/1.0')).resolves.toBe(true)
  })

  it('fetchRobotsTxtCached returns permissive robots.txt on 404', async () => {
    await expect(fetchRobotsTxtCached('example.org')).resolves.toBe(PERMISSIVE_ROBOTS_TXT)
  })

  it('isUrlCrawlable allows crawling when robots.txt returns 404', async () => {
    await expect(isUrlCrawlable('https://example.com/page', 'MyBot/1.0')).resolves.toBe(true)
  })

  it('fetchRobotsTxtCached returns disallow robots.txt for blacklisted domains', async () => {
    const testDomain = `test-blacklist-${Math.random().toString(36).slice(2)}.com`

    // Add domain to blacklist and bloom filter so checkDomainBlacklisted takes the full query path
    await insertTestDomainBlacklist(testDomain)
    await addDomainsToBloomFilter([testDomain])

    const result = await fetchRobotsTxtCached(testDomain)

    expect(result).toBe('User-agent: *\nDisallow: /')
  })

  it('isUrlCrawlable returns false for blacklisted domains', async () => {
    const testDomain = `test-blacklist-crawl-${Math.random().toString(36).slice(2)}.com`

    // Add domain to blacklist and bloom filter so checkDomainBlacklisted takes the full query path
    await insertTestDomainBlacklist(testDomain)
    await addDomainsToBloomFilter([testDomain])

    const result = await isUrlCrawlable(`https://${testDomain}/page`, 'MyBot/1.0')

    expect(result).toBe(false)
  })
})
