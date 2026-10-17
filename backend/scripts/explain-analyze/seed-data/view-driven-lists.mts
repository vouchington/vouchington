import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

// Keep more than one page in the requested list, plus rows excluded by both
// list and item lifecycle filters.
export async function seedViewDrivenLists(): Promise<void> {
  const listId = seedUuid(0, '34')
  const removedListId = seedUuid(1, '34')
  const importListId = seedUuid(2, '34')
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedViewDrivenLists */ INSERT INTO user_lists
       (id, created_via, owner_user_id, name, removed_at)
     VALUES ($1::uuid, 'system', $3::uuid, 'Explain list', NULL),
       ($2::uuid, 'system', $3::uuid, 'Removed explain list', CURRENT_TIMESTAMP),
       ($4::uuid, 'system', $3::uuid, 'Import target list', NULL)
     ON CONFLICT (id) DO NOTHING`,
    [listId, removedListId, seedUuid(0, '01'), importListId],
  )
  const ids = Array.from({ length: 1080 }, (_, index) => seedUuid(index, '05'))
  await transaction(
    `/* seedViewDrivenLists */ INSERT INTO user_list_posts
       (id, user_list_id, post_id, removed_at)
     SELECT uuidv7(), CASE WHEN seeded.ordinal > 70 THEN $2::uuid ELSE $1::uuid END,
       seeded.post_id, CASE WHEN seeded.ordinal > 60 AND seeded.ordinal <= 70 THEN CURRENT_TIMESTAMP END
     FROM unnest($3::uuid[]) WITH ORDINALITY AS seeded(post_id, ordinal)
     ON CONFLICT DO NOTHING`,
    [listId, removedListId, ids],
  )
  await transaction(
    `/* seedViewDrivenLists */ INSERT INTO community_list_posts
       (community_id, post_id, added_by_id, removed_at)
     SELECT $1::uuid, seeded.post_id, $2::uuid,
       CASE WHEN seeded.ordinal > 30 THEN CURRENT_TIMESTAMP END
     FROM unnest($3::uuid[]) WITH ORDINALITY AS seeded(post_id, ordinal)
     ON CONFLICT DO NOTHING`,
    [seedUuid(0, '14'), seedUuid(0, '01'), ids.slice(0, 35)],
  )
  await transaction(
    `/* seedViewDrivenLists */ INSERT INTO community_list_rss_feeds
       (community_id, rss_feed_id, added_by_id, removed_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, NULL),
       ($1::uuid, $4::uuid, $3::uuid, CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING`,
    [seedUuid(0, '14'), seedUuid(0, '08'), seedUuid(0, '01'), seedUuid(1, '08')],
  )
  await transaction.commit()
}
