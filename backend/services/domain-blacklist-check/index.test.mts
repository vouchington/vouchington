import { describe, it, expect, beforeAll } from 'vitest'
import { assertNoBlockedDomains, assertUrlNotBlocked } from './index.mts'
import { insertTestDomainBlacklist, createTestBlacklistSource } from '@voucha/test-helpers'
import { addDomainsToBloomFilter } from '@services/urls-domains-blacklist/bloom-filter'

describe('index', () => {
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
  const RANDOM_ID = Array.from({ length: 8 }, () => LETTERS[Math.floor(Math.random() * 26)]).join(
    '',
  )
  const TEST_BLOCKED_DOMAIN = `profile-blacklist-test-${RANDOM_ID}.com`
  const TEST_SOURCE_NAME = `test-profile-blacklist-${RANDOM_ID}`

  beforeAll(async () => {
    await createTestBlacklistSource({
      type: 'url',
      name: TEST_SOURCE_NAME,
      url: 'https://example.com/blacklist.txt',
    })
    await insertTestDomainBlacklist(TEST_BLOCKED_DOMAIN, TEST_SOURCE_NAME)
    await addDomainsToBloomFilter([TEST_BLOCKED_DOMAIN])
  }, 30_000)

  describe('assertNoBlockedDomains', () => {
    it('passes with plain text (no URLs)', async () => {
      await expect(assertNoBlockedDomains('Hello world, no links here.')).resolves.toBeUndefined()
    })

    it('passes with empty string', async () => {
      await expect(assertNoBlockedDomains('')).resolves.toBeUndefined()
    })

    it('passes with clean URLs', async () => {
      const markdown =
        'Check out [this site](https://example.com) and ![img](https://cdn.example.org/img.png).'
      await expect(assertNoBlockedDomains(markdown)).resolves.toBeUndefined()
    })

    it('rejects markdown containing a blacklisted domain (status 400, message includes domain)', async () => {
      const markdown = `Visit [bad site](https://${TEST_BLOCKED_DOMAIN}/page) for more info.`
      await expect(assertNoBlockedDomains(markdown)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining(TEST_BLOCKED_DOMAIN),
      })
    })

    it('rejects when one of multiple URLs is blocked', async () => {
      const markdown = `[clean](https://example.com) and [bad](https://${TEST_BLOCKED_DOMAIN})`
      await expect(assertNoBlockedDomains(markdown)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining(TEST_BLOCKED_DOMAIN),
      })
    })
  })

  describe('assertUrlNotBlocked', () => {
    it('passes for a clean URL', async () => {
      await expect(assertUrlNotBlocked('https://example.com/page')).resolves.toBeUndefined()
    })

    it('rejects a blocked domain (status 400)', async () => {
      await expect(
        assertUrlNotBlocked(`https://${TEST_BLOCKED_DOMAIN}/page`),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining(TEST_BLOCKED_DOMAIN),
      })
    })

    it('passes for an invalid URL (domain resolves to unknown)', async () => {
      await expect(assertUrlNotBlocked('not-a-valid-url')).resolves.toBeUndefined()
    })
  })
})
