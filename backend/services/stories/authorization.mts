import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { FEED_NOT_DISCOVERABLE } from '@modules/on-error/error-codes'
import type { PrivateUser } from '@services/users/types'

export function currentUserCanCreateStoryPost(currentUser: PrivateUser | null): boolean {
  return currentUser != null
}

export async function assertRssFeedItemIsDiscoverable(rssFeedItemId: string): Promise<void> {
  const item = await getRssFeedItemById(rssFeedItemId, { readOnly: false })
  assert(item, 404, 'RSS feed item not found')
  if (item.rss_feed.is_discoverable) return
  throw createCodedError(
    403,
    'RSS feed is not discoverable; use the regular discussion creation flow',
    FEED_NOT_DISCOVERABLE,
  )
}

export async function assertStoryIsDiscoverable(storyId: string): Promise<void> {
  const { rows } = await read(
    sql`/* assertStoryIsDiscoverable */
      SELECT
        s.id AS story_id,
        (
          SELECT rfi.id
          FROM rss_feed_items rfi
          WHERE rfi.story_id = s.id
            AND rfi.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM rss_feed_item_sources rfis
              JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
              WHERE rfis.rss_feed_item_id = rfi.id
                AND rf.deleted_at IS NULL
            )
          ORDER BY
            CASE WHEN rfi.id = s.official_rss_feed_item_id THEN 0 ELSE 1 END,
            rfi.id ASC
          LIMIT 1
        ) AS item_id
      FROM stories s
      WHERE s.id = ${storyId}
        AND s.deleted_at IS NULL
      LIMIT 1
    `,
    { readOnly: false },
  )
  const row = rows[0]
  assert(row, 404, 'Story not found')
  const itemId = row.item_id as string | null
  if (!itemId) {
    throw createCodedError(
      403,
      'Story has no eligible source items; cannot create story post',
      FEED_NOT_DISCOVERABLE,
    )
  }
  await assertRssFeedItemIsDiscoverable(itemId)
}
