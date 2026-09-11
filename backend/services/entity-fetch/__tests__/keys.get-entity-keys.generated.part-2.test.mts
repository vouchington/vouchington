import { it, expect, describe } from 'vitest'

import {
  getUserCacheKeys,
  getTopicCacheKeys,
  getUrlHostnameCacheKeys,
} from '@services/entity-cache/keys'

import { createTestUser, softDeleteTopic } from '@voucha/test-helpers'

import { createTopic } from '@services/topics/create'

import { createTopicAliases } from '@services/topics/aliases'

import { v7 } from 'uuid'

// getUrlHostnameCacheKeys resolves against the real url_hostnames table, which permanently
// seeds 'example.com' as fixture data — a fixed literal would collide with that row and pull
// in its id, so each case needs its own hostname guaranteed absent from the table.
const uniqueTestHostname = (label: string): string =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com`

describe('keys.generated (entity cache keys)', () => {
  it('getTopicCacheKeys returns alias key for soft-deleted topic', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const alias = `alias-${random}`
    await createTopicAliases(topic.id, alias)
    await softDeleteTopic(topic.id, user!.id)

    const result = await getTopicCacheKeys(topic.id)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
    expect(result).toContain(alias)
  })

  it('getUrlHostnameCacheKeys returns empty array for empty input', async () => {
    const result = await getUrlHostnameCacheKeys()
    expect(result).toEqual([])
  })

  it('getUrlHostnameCacheKeys extracts UUIDs from string array', async () => {
    const uuid1 = v7()
    const uuid2 = v7()
    const result = await getUrlHostnameCacheKeys(uuid1, uuid2)
    expect(result.length).toBe(2)
    expect(result).toContain(uuid1.toLowerCase())
    expect(result).toContain(uuid2.toLowerCase())
  })

  it('getUrlHostnameCacheKeys extracts hostnames from string array', async () => {
    const hostnameA = uniqueTestHostname('array-a')
    const hostnameB = uniqueTestHostname('array-b')
    const result = await getUrlHostnameCacheKeys(hostnameA, hostnameB)
    expect(result.length).toBe(2)
    expect(result).toContain(hostnameA)
    expect(result).toContain(hostnameB)
  })

  it('getUrlHostnameCacheKeys extracts id from object', async () => {
    const uuid = v7()
    const result = await getUrlHostnameCacheKeys({ id: uuid })
    expect(result.length).toBe(1)
    expect(result).toContain(uuid.toLowerCase())
  })

  it('getUrlHostnameCacheKeys extracts hostname from object', async () => {
    const hostname = uniqueTestHostname('object-hostname')
    const result = await getUrlHostnameCacheKeys({ hostname })
    expect(result.length).toBe(1)
    expect(result).toContain(hostname)
  })

  it('getUrlHostnameCacheKeys extracts all properties from object', async () => {
    const uuid = v7()
    const hostname = uniqueTestHostname('object-all')
    const result = await getUrlHostnameCacheKeys({ id: uuid, hostname })
    expect(result.length).toBe(2)
    expect(result).toContain(uuid.toLowerCase())
    expect(result).toContain(hostname)
  })

  it('getUrlHostnameCacheKeys handles nested arrays', async () => {
    const uuid = v7()
    const hostnameA = uniqueTestHostname('nested-a')
    const hostnameB = uniqueTestHostname('nested-b')
    const result = await getUrlHostnameCacheKeys([[uuid, hostnameA], [hostnameB]])
    expect(result.length).toBe(3)
    expect(result).toContain(uuid.toLowerCase())
    expect(result).toContain(hostnameA)
    expect(result).toContain(hostnameB)
  })

  it('getUrlHostnameCacheKeys filters out invalid values', async () => {
    const uuid = v7()
    const hostname = uniqueTestHostname('filters-valid')
    const result = await getUrlHostnameCacheKeys(
      uuid,
      null,
      undefined,
      '',
      false,
      0,
      hostname,
      'not-a-valid-hostname!',
    )
    expect(result.length).toBe(2)
    expect(result).toContain(uuid.toLowerCase())
    expect(result).toContain(hostname)
    expect(result).not.toContain('not-a-valid-hostname!')
  })

  it('getUrlHostnameCacheKeys converts strings to lowercase', async () => {
    const uuid = v7().toUpperCase()
    const hostnameA = uniqueTestHostname('lowercase-a')
    const hostnameB = uniqueTestHostname('lowercase-b')
    // Hostnames must be lowercase to match isHostname pattern, so we test with lowercase inputs
    const result = await getUrlHostnameCacheKeys(uuid, hostnameA, hostnameB)
    expect(result.length).toBe(3)
    expect(result).toContain(uuid.toLowerCase())
    expect(result).toContain(hostnameA)
    expect(result).toContain(hostnameB)
  })

  it('getUrlHostnameCacheKeys handles mixed UUID and hostname inputs', async () => {
    const uuid1 = v7()
    const uuid2 = v7()
    const hostnameA = uniqueTestHostname('mixed-a')
    const hostnameB = uniqueTestHostname('mixed-b')
    const result = await getUrlHostnameCacheKeys(
      uuid1,
      { id: uuid2, hostname: hostnameA },
      hostnameB,
    )
    expect(result.length).toBe(4)
    expect(result).toContain(uuid1.toLowerCase())
    expect(result).toContain(uuid2.toLowerCase())
    expect(result).toContain(hostnameA)
    expect(result).toContain(hostnameB)
  })

  it('getUrlHostnameCacheKeys ignores slugs (not hostnames)', async () => {
    const result = await getUrlHostnameCacheKeys('test-slug', 'another-slug')
    // Slugs don't match hostname pattern, so they should be ignored
    expect(result.length).toBe(0)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getUserCacheKeys)
})
