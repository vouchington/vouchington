import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { getBookmarkMapsForEntityGroups } from '@services/bookmarks/get'
import { paginationMaxima } from '@services/pagination/config'
import sql from 'sql-template-strings'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

async function seedViewerBookmarks(postIds: string[], creatorIds: string[]) {
  const username = `explain-post-card-bookmarks-${randomUUID()}`
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`
    /* seedPostCardBookmarkViewer */
    INSERT INTO users (username) VALUES (${username}) RETURNING id
  `)
  const viewer = { ...seedUser, id: rows[0]!.id, username }
  const deletedPostIds = postIds.slice(40, 45)
  const deletedCreatorIds = creatorIds.slice(20, 25)

  await transaction(sql`
    /* seedPostCardSavedPosts */
    INSERT INTO relation__user__save__post (subject_id, object_id, created_by_id, deleted_at)
    SELECT ${viewer.id}, object_id, ${viewer.id},
      CASE WHEN object_id = ANY(${deletedPostIds}::uuid[]) THEN CURRENT_TIMESTAMP END
    FROM unnest(${postIds.slice(0, 30).concat(deletedPostIds)}::uuid[]) AS fixture(object_id)
  `)
  await transaction(sql`
    /* seedPostCardFollowedPosts */
    INSERT INTO relation__user__follow__post (subject_id, object_id, created_by_id, deleted_at)
    SELECT ${viewer.id}, object_id, ${viewer.id},
      CASE WHEN object_id = ANY(${deletedPostIds}::uuid[]) THEN CURRENT_TIMESTAMP END
    FROM unnest(${postIds.slice(20, 40).concat(deletedPostIds)}::uuid[]) AS fixture(object_id)
  `)
  await transaction(sql`
    /* seedPostCardFollowedCreators */
    INSERT INTO relation__user__follow__user (subject_id, object_id, created_by_id, deleted_at)
    SELECT ${viewer.id}, object_id, ${viewer.id},
      CASE WHEN object_id = ANY(${deletedCreatorIds}::uuid[]) THEN CURRENT_TIMESTAMP END
    FROM unnest(${creatorIds.slice(0, 20).concat(deletedCreatorIds)}::uuid[]) AS fixture(object_id)
  `)
  await transaction.commit()
  return viewer
}

export async function runPostCardBookmarkCapacityScenario(): Promise<void> {
  const limit = paginationMaxima.max_limit
  // These seeded posts have distinct creators at the same indices. The general seed also
  // includes saves by seedUser and follows by other viewers on these same posts.
  const indices = Array.from({ length: limit }, (_, offset) => 3_000 + offset)
  const postIds = indices.map(index => seedUuid(index, '05'))
  const creatorIds = indices.map(index => seedUuid(index, '01'))
  // A fresh viewer has no populated bookmark Bloom filter, so the production call queries all IDs.
  const viewer = await seedViewerBookmarks(postIds, creatorIds)
  try {
    const expectedPostBookmarks = Object.fromEntries([
      ...postIds.slice(0, 20).map(id => [id, { save: true }]),
      ...postIds.slice(20, 30).map(id => [id, { save: true, follow: true }]),
      ...postIds.slice(30, 40).map(id => [id, { follow: true }]),
    ])
    const expectedCreatorBookmarks = Object.fromEntries(
      creatorIds.slice(0, 20).map(id => [id, { follow: true }]),
    )
    await runAndCapture(
      'post-and-creator-bookmarks-at-cap',
      async () => {
        const maps = await getBookmarkMapsForEntityGroups(viewer, [
          { entityTypeName: 'post', entities: postIds },
          { entityTypeName: 'user', entities: creatorIds },
        ])
        assert.deepEqual(maps, [expectedPostBookmarks, expectedCreatorBookmarks])
      },
      undefined,
      'queryEntityBookmarksForRelations',
      { exactCapturedNames: ['queryEntityBookmarksForRelations'] },
    )
  } finally {
    // The relation rows cascade by subject ID.
    await write(sql`/* deletePostCardBookmarkViewer */ DELETE FROM users WHERE id = ${viewer.id}`)
  }
}
