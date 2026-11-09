import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { MAX_LANDING_PAGES } from '@services/my/landing-pages/shared'
import { seedUuid } from '../seed-data/common.mts'
import { seedPostId, seedTopicId } from '../run-support.mts'

const PAGES_PER_OWNER = MAX_LANDING_PAGES
const OWNER_COUNT = Math.ceil(2000 / PAGES_PER_OWNER)
const CLEANUP_BATCH_SIZE = 25

/** Build a selective landing-item corpus with the exact production page cap per owner. */
export async function seedLandingPageItemReplacementCorpus(): Promise<string[]> {
  const ownerIds = Array.from({ length: OWNER_COUNT }, (_, index) => seedUuid(19_000 + index, '01'))
  const existing = await write<{ id: string }>(
    `/* findLandingReplacementCorpusOwners */
     SELECT id FROM users
     WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM user_landing_pages page WHERE page.user_id = users.id
       )
     ORDER BY id`,
    [ownerIds],
  )
  assert.equal(existing.rows.length, OWNER_COUNT)

  const pages = await write<{ id: string }>(
    `/* seedLandingReplacementCorpusPages */
     INSERT INTO user_landing_pages (user_id, title, slug, slot)
     SELECT owner.user_id, 'Explain replacement corpus', 'replacement-' || page.page_number,
       page.page_number + 1
     FROM UNNEST($1::uuid[]) AS owner(user_id)
     CROSS JOIN GENERATE_SERIES(0, $2::integer - 1) AS page(page_number)
     RETURNING id`,
    [ownerIds, PAGES_PER_OWNER],
  )
  const pageIds = pages.rows.map(row => row.id)

  try {
    assert.equal(pageIds.length, OWNER_COUNT * PAGES_PER_OWNER)
    const items = await write<{ id: string }>(
      `/* seedLandingReplacementCorpusItems */
       INSERT INTO user_landing_page_items (
         landing_page_id, item_type, topic_id, sort_order
       )
       SELECT page_id, 'topic_group', $2::uuid, 0
       FROM UNNEST($1::uuid[]) AS source(page_id)
       RETURNING id`,
      [pageIds, seedTopicId],
    )
    assert.equal(items.rows.length, pageIds.length)
    const itemIds = items.rows.map(row => row.id)
    const members = await write(
      `/* seedLandingReplacementCorpusGroupMembers */
       INSERT INTO user_landing_page_group_members (
         landing_page_item_id, member_type, sort_order, review_post_id
       )
       SELECT item_id, 'review', 0, $2::uuid
       FROM UNNEST($1::uuid[]) AS source(item_id)`,
      [itemIds, seedPostId],
    )
    assert.equal(members.rowCount, pageIds.length)
    await write(`/* analyzeLandingReplacementCorpus */
      ANALYZE user_landing_page_items, user_landing_page_group_members, user_landing_pages`)
    return pageIds
  } catch (err) {
    await cleanupLandingPageItemReplacementCorpus(pageIds)
    throw err
  }
}

/** Delete only pages returned by this corpus seed, then restore empty-table planner statistics. */
export async function cleanupLandingPageItemReplacementCorpus(pageIds: string[]): Promise<void> {
  for (let offset = 0; offset < pageIds.length; offset += CLEANUP_BATCH_SIZE) {
    const batch = pageIds.slice(offset, offset + CLEANUP_BATCH_SIZE)
    // no-mistakes-disable-next-line query-reached-per-item: fixture cleanup already batches 25 owned pages per cascading delete to bound trigger work.
    const deleted = await write<{ id: string }>(
      `/* cleanupLandingReplacementCorpusPages */
       DELETE FROM user_landing_pages WHERE id = ANY($1::uuid[]) RETURNING id`,
      [batch],
    )
    assert.deepEqual(deleted.rows.map(row => row.id).toSorted(), [...batch].toSorted())
  }
  await write(`/* vacuumLandingReplacementCorpus */
    VACUUM (ANALYZE)
      user_landing_page_items, user_landing_page_group_members, user_landing_pages`)
}
