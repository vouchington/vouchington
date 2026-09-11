import { Buffer } from 'node:buffer'
import { v7 } from 'uuid'
import type { GlideClient } from '@valkey/valkey-glide'
import { it, expect, describe, vi } from 'vitest'
import {
  expireOrphanedBloomFilterBuildingKeys,
  expireBookmarkBloomFiltersMissingTtl,
} from './bloom-filter.mts'
import { bloomValkeyClient } from './clients.mts'

// Deliberately far above any TTL a test pre-sets (see the NX test below) and above any single
// test run's duration: this sweep runs against the real, shared `bloomValkeyClient`, so a short
// TTL here could expire a live bookmark key that a concurrently-running suite just created
// without one, out from under it. Mirrors ORPHANED_BUILDING_KEY_TTL_SECONDS's magnitude for the
// same reason.
const BOOKMARK_SWEEP_TTL_SECONDS = 60 * 60 * 24

function buildingKey(): string {
  return `bloom-filter:test-${v7()}:building`
}

function bookmarkLiveKey(): string {
  return `bloom-filter:user-bookmarks:${v7()}`
}

describe('expireOrphanedBloomFilterBuildingKeys', () => {
  it('attaches a TTL to a building key that has none', async () => {
    const key = buildingKey()
    await bloomValkeyClient.set(key, 'x')
    try {
      expect(await bloomValkeyClient.ttl(key)).toBe(-1)

      await expireOrphanedBloomFilterBuildingKeys()

      expect(await bloomValkeyClient.ttl(key)).toBeGreaterThan(0)
    } finally {
      await bloomValkeyClient.unlink([key])
    }
  })

  it('does not overwrite an existing TTL (NX semantics)', async () => {
    const key = buildingKey()
    await bloomValkeyClient.set(key, 'x')
    await bloomValkeyClient.expire(key, 5)
    try {
      await expireOrphanedBloomFilterBuildingKeys()

      const ttl = await bloomValkeyClient.ttl(key)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(5)
    } finally {
      await bloomValkeyClient.unlink([key])
    }
  })

  it('does nothing when there are no building keys', async () => {
    await expect(expireOrphanedBloomFilterBuildingKeys()).resolves.toBeUndefined()
  })

  it('rethrows scan failures instead of swallowing them', async () => {
    const scanError = new Error('scan boom')
    const throwingClient = { scan: () => Promise.reject(scanError) } as unknown as GlideClient

    await expect(expireOrphanedBloomFilterBuildingKeys(throwingClient)).rejects.toThrow(scanError)
  })
})

describe('expireBookmarkBloomFiltersMissingTtl', () => {
  it('attaches a TTL to a bookmark live key that has none', async () => {
    const key = bookmarkLiveKey()
    await bloomValkeyClient.set(key, 'x')
    try {
      expect(await bloomValkeyClient.ttl(key)).toBe(-1)

      await expireBookmarkBloomFiltersMissingTtl(BOOKMARK_SWEEP_TTL_SECONDS)

      expect(await bloomValkeyClient.ttl(key)).toBeGreaterThan(0)
    } finally {
      await bloomValkeyClient.unlink([key])
    }
  })

  it('does not overwrite an existing TTL (NX semantics)', async () => {
    const key = bookmarkLiveKey()
    await bloomValkeyClient.set(key, 'x')
    await bloomValkeyClient.expire(key, 5)
    try {
      await expireBookmarkBloomFiltersMissingTtl(BOOKMARK_SWEEP_TTL_SECONDS)

      const ttl = await bloomValkeyClient.ttl(key)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(5)
    } finally {
      await bloomValkeyClient.unlink([key])
    }
  })

  // Regression lock for the `shouldExpire` predicate: `bloom-filter:user-bookmarks:*` matches
  // both the live key and its `:building` key (valkyries derives both from the same filter
  // name), so without the predicate this sweep would win the NX race against
  // expireOrphanedBloomFilterBuildingKeys and pin a dead building key at the bookmark TTL
  // instead of ORPHANED_BUILDING_KEY_TTL_SECONDS. Assert against a distinctive sentinel TTL
  // rather than `toBe(-1)`, since a concurrently-running building-key sweep could legitimately
  // attach its own (different) TTL to this same key without that indicating this predicate broke.
  it('does not attach its TTL to a matching :building key', async () => {
    const SENTINEL_TTL_SECONDS = 4321
    const key = `${bookmarkLiveKey()}:building`
    await bloomValkeyClient.set(key, 'x')
    try {
      await expireBookmarkBloomFiltersMissingTtl(SENTINEL_TTL_SECONDS)

      expect(await bloomValkeyClient.ttl(key)).not.toBe(SENTINEL_TTL_SECONDS)
    } finally {
      await bloomValkeyClient.unlink([key])
    }
  })

  it('excludes a Buffer :building key from the upstream predicate', async () => {
    const scan = vi
      .fn<() => Promise<[string, Buffer[]]>>()
      .mockResolvedValue(['0', [Buffer.from(`${bookmarkLiveKey()}:building`)]])
    const exec = vi.fn<() => Promise<never[]>>()
    const client = { scan, exec } as unknown as GlideClient

    await expireBookmarkBloomFiltersMissingTtl(BOOKMARK_SWEEP_TTL_SECONDS, client)

    expect(exec).not.toHaveBeenCalled()
  })

  it('does nothing when there are no matching keys', async () => {
    await expect(
      expireBookmarkBloomFiltersMissingTtl(BOOKMARK_SWEEP_TTL_SECONDS),
    ).resolves.toBeUndefined()
  })

  it('rethrows scan failures instead of swallowing them', async () => {
    const scanError = new Error('scan boom')
    const throwingClient = { scan: () => Promise.reject(scanError) } as unknown as GlideClient

    await expect(
      expireBookmarkBloomFiltersMissingTtl(BOOKMARK_SWEEP_TTL_SECONDS, throwingClient),
    ).rejects.toThrow(scanError)
  })
})
