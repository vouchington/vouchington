import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import { getBookmarkMapsForEntityGroups } from '@services/bookmarks/get'
import { paginationMaxima } from '@services/pagination/config'
import sql from 'sql-template-strings'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

async function seedRssBookmarkViewer(
  savedIds: string[],
  hiddenIds: string[],
  followedIds: string[],
  deletedItemId: string,
  deletedFeedId: string,
) {
  const username = `explain-rss-card-bookmarks-${randomUUID()}`
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(sql`
    /* seedRssBookmarkViewer */ INSERT INTO users (username) VALUES (${username}) RETURNING id
  `)
  const viewer = { ...seedUser, id: rows[0]!.id, username }
  await query(sql`
    /* seedRssCardSavedItems */
    INSERT INTO relation__user__save__rss_feed_item (subject_id, object_id, created_by_id, deleted_at)
    SELECT ${viewer.id}, object_id, ${viewer.id},
      CASE WHEN object_id = ${deletedItemId} THEN CURRENT_TIMESTAMP END
    FROM unnest(${[...savedIds, deletedItemId]}::uuid[]) AS fixture(object_id)
  `)
  await query(sql`
    /* seedRssCardHiddenItems */
    INSERT INTO relation__user__hide__rss_feed_item (subject_id, object_id, created_by_id)
    SELECT ${viewer.id}, object_id, ${viewer.id}
    FROM unnest(${hiddenIds}::uuid[]) AS fixture(object_id)
  `)
  await query(sql`
    /* seedRssCardFollowedFeeds */
    INSERT INTO relation__user__follow__rss_feed (subject_id, object_id, created_by_id, deleted_at)
    SELECT ${viewer.id}, object_id, ${viewer.id},
      CASE WHEN object_id = ${deletedFeedId} THEN CURRENT_TIMESTAMP END
    FROM unnest(${[...followedIds, deletedFeedId]}::uuid[]) AS fixture(object_id)
  `)
  await query.commit()
  return viewer
}

export async function runRssCardBookmarkCapacityScenario(): Promise<void> {
  // Each primary card can add three distinct story preview items to the bookmark input.
  const limit = paginationMaxima.max_limit * 4
  const guids = Array.from({ length: limit + 1 }, (_, index) => `seed-item-guid-${index}`)
  const feedIds = Array.from({ length: limit + 1 }, (_, index) => seedUuid(index, '08'))
  const { rows } = await read<{ id: string }>(sql`
    /* loadRssCardBookmarkFixtureIds */
    SELECT g.id
    FROM unnest(${guids}::text[], ${feedIds}::uuid[]) WITH ORDINALITY AS fixture(guid, feed_id, position)
    JOIN rss_feed_item_guids g ON g.guid = fixture.guid
    JOIN rss_feed_item_sources source
      ON source.rss_feed_item_id = g.id AND source.rss_feed_id = fixture.feed_id
    ORDER BY fixture.position
  `)
  const itemIds = rows.map(row => row.id)
  assert.equal(itemIds.length, limit + 1)
  assert.equal(new Set(itemIds).size, limit + 1)
  const savedIds = itemIds.slice(0, 100)
  const hiddenIds = itemIds.slice(75, 125)
  const followedIds = feedIds.slice(0, 80)
  const viewer = await seedRssBookmarkViewer(
    [...savedIds, itemIds[limit]!],
    hiddenIds,
    [...followedIds, feedIds[limit]!],
    itemIds[125]!,
    feedIds[80]!,
  )
  try {
    const expectedItems = Object.fromEntries([
      ...savedIds.slice(0, 75).map(id => [id, { save: true }]),
      ...savedIds.slice(75).map(id => [id, { save: true, hide: true }]),
      ...hiddenIds.slice(25).map(id => [id, { hide: true }]),
    ])
    const expectedFeeds = Object.fromEntries(followedIds.map(id => [id, { follow: true }]))
    await runAndCapture(
      'rss-item-and-feed-bookmarks-at-cap',
      async () => {
        const maps = await getBookmarkMapsForEntityGroups(viewer, [
          { entityTypeName: 'rss_feed_item', entities: itemIds.slice(0, limit) },
          { entityTypeName: 'rss_feed', entities: feedIds.slice(0, limit) },
        ])
        assert.deepEqual(maps, [expectedItems, expectedFeeds])
      },
      undefined,
      'queryEntityBookmarksForRelations',
      { exactCapturedNames: ['queryEntityBookmarksForRelations'] },
    )
  } finally {
    await write(sql`/* deleteRssCardBookmarkViewer */ DELETE FROM users WHERE id = ${viewer.id}`)
  }
}
