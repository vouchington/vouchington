import { withIsolatedRssSnapshotGeneration } from '@voucha/test-helpers/rss-snapshot-generation-scope'
import { stableSerialize } from '@services/entity-cache/search-cache'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { valkeyEvents } from 'valkyries'
import {
  getRssSnapshotLegalGeneration,
  invalidateRssSnapshotsForLegalRemoval,
} from '@services/entity-cache/rss-snapshot-generation'
import { getPublicRssPostSnapshotsCached } from '@services/posts/public-rss-snapshots'
import { caches } from '@services/entity-cache/caches'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { makeTestRssPostPrivate } from '@voucha/test-helpers/rss-private-edit'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'

describe('legal RSS snapshot eviction', () => {
  it('legal eviction prevents retained public snapshots from refilling after an edge purge', async () => {
    const author = await createTestUserDirect()
    const markdown = `public-${randomUUID()}`
    const id = await insertTestPost({
      title: 'Legal RSS cache fixture',
      slug: `rss-legal-${randomUUID()}`,
      createdById: author.id,
      markdown,
    })
    const options = { postIds: [id] }
    const stored = Promise.withResolvers<void>()
    const onSet = (event: { cacheName: string }) => {
      if (event.cacheName === 'rss_public_post_snapshots_anon') stored.resolve()
    }
    valkeyEvents.on('cache:set', onSet)
    try {
      const generation = await getRssSnapshotLegalGeneration()
      const first = await getPublicRssPostSnapshotsCached(options)
      expect(first[0]?.markdown).toBe(markdown)
      await stored.promise
      const secret = `private-${randomUUID()}`
      await makeTestRssPostPrivate(id, secret)
      await caches.posts.delete(id)

      // An ordinary edit/entity invalidation must preserve the public snapshot.
      const warm = await withCapturedTestQueries(() => getPublicRssPostSnapshotsCached(options))
      const legalEviction = generation !== (await getRssSnapshotLegalGeneration())
      // Concurrent legal actions may already have retired the shared namespace.
      expect(legalEviction ? [[], [{ id, markdown }]] : [[{ id, markdown }]]).toContainEqual(
        warm.result.map(post => ({ id: post.id, markdown: post.markdown })),
      )
      expect(
        warm.queries.filter(
          query => !legalEviction || !query.text.includes('/* getPublicRssPostSnapshots */'),
        ),
      ).toEqual([])

      // Only the legal hook retires that namespace before the edge purge can complete.
      await invalidateRssSnapshotsForLegalRemoval()
      expect(await getRssSnapshotLegalGeneration()).not.toBe(generation)
      const removed = await getPublicRssPostSnapshotsCached(options)
      expect(removed).toEqual([])
    } finally {
      valkeyEvents.off('cache:set', onSet)
    }
  })
  it('does not revive a retained public snapshot when its generation key is evicted', async () => {
    await withIsolatedRssSnapshotGeneration(async scope => {
      const author = await createTestUserDirect()
      const markdown = `public-before-generation-loss-${randomUUID()}`
      const id = await insertTestPost({
        title: 'RSS generation loss',
        slug: `rss-generation-loss-${randomUUID()}`,
        createdById: author.id,
        markdown,
      })
      const generation = await getRssSnapshotLegalGeneration()
      const options = { postIds: [id] }
      const oldKey = stableSerialize({ ...options, legalGeneration: generation })
      const stored = Promise.withResolvers<void>()
      const onSet = (event: { cacheName: string; keys: string[] }) => {
        if (event.cacheName === 'rss_public_post_snapshots_anon' && event.keys.includes(oldKey))
          stored.resolve()
      }
      valkeyEvents.on('cache:set', onSet)
      try {
        expect((await getPublicRssPostSnapshotsCached(options))[0]?.markdown).toBe(markdown)
        await stored.promise
        await makeTestRssPostPrivate(id, `never-public-${randomUUID()}`)
        await scope.evict()

        const replacement = await getRssSnapshotLegalGeneration()
        expect(replacement).not.toBe(generation)
        expect(await getPublicRssPostSnapshotsCached(options)).toEqual([])
        expect(await scope.readSnapshot(oldKey)).toMatchObject([{ id, markdown }])
      } finally {
        valkeyEvents.off('cache:set', onSet)
      }
    })
  })

  it('returns the winning namespace to both concurrent missing-key initializers', async () => {
    await withIsolatedRssSnapshotGeneration(async scope => {
      const generations = await Promise.all([
        getRssSnapshotLegalGeneration(),
        getRssSnapshotLegalGeneration(),
      ])
      const winner = scope.initializations.find(attempt => attempt.installed)
      const loser = scope.initializations.find(attempt => !attempt.installed)
      expect(scope.initializations).toHaveLength(2)
      expect(winner).toBeDefined()
      expect(loser).toBeDefined()
      expect(loser?.generation).not.toBe(winner?.generation)
      expect(generations).toEqual([winner?.generation, winner?.generation])
      expect(generations).not.toContain(loser?.generation)
    }, 2)
  })
})
