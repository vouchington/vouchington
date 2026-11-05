import { read, write } from '@data-stores/psql'

/** Read the stored flag and independently derive the full current truth for an owned post. */
export async function getPostHackerNewsFlagStateForTest(postId: string) {
  const { rows } = await read<{ stored: boolean; expected: boolean }>(
    `/* getPostHackerNewsFlagStateForTest */
    SELECT post.has_hacker_news_references AS stored,
      EXISTS (
        SELECT 1 FROM urls source
        LEFT JOIN urls hop ON hop.id = source.canonical_url_id
        JOIN url_hacker_news_totals totals
          ON totals.url_id = COALESCE(hop.canonical_url_id, source.canonical_url_id, source.id)
        WHERE ((post.post_type = 'link' AND source.id = post.url_id) OR source.id IN (
          SELECT relation.object_id FROM relation__post__related__url relation
          WHERE relation.subject_id = post.id AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
          ORDER BY relation.votes_score_sort DESC, relation.created_at DESC, relation.object_id DESC
          LIMIT 10
        )) AND (totals.story_count > 0 OR totals.comment_count > 0)
      ) AS expected
    FROM posts post WHERE post.id = $1::uuid`,
    [postId],
  )
  return rows[0]
}

export async function getRssHackerNewsFlagStateForTest(itemId: string) {
  const { rows } = await read<{ stored: boolean; expected: boolean }>(
    `/* getRssHackerNewsFlagStateForTest */
    SELECT item.has_hacker_news_references AS stored,
      EXISTS (
        SELECT 1 FROM urls source
        LEFT JOIN urls hop ON hop.id = source.canonical_url_id
        JOIN url_hacker_news_totals totals
          ON totals.url_id = COALESCE(hop.canonical_url_id, source.canonical_url_id, source.id)
        WHERE source.id = item.url_id AND (totals.story_count > 0 OR totals.comment_count > 0)
      ) AS expected
    FROM rss_feed_items item WHERE item.id = $1::uuid`,
    [itemId],
  )
  return rows[0]
}

export async function getRssUpdatedAtForTest(itemId: string): Promise<string> {
  const { rows } = await write<{ updated_at: string }>(
    '/* getRssUpdatedAtForTest */ SELECT updated_at::text FROM rss_feed_items WHERE id = $1',
    [itemId],
  )
  return rows[0]!.updated_at
}

export async function updateRssContentForTest(
  itemId: string,
  mode: 'content' | 'noop' | 'mixed',
  previous: string,
) {
  let set: string
  switch (mode) {
    case 'content':
      set = `data = data || '{"title":"Changed"}'::jsonb`
      break
    case 'noop':
      set = 'data = data'
      break
    case 'mixed':
      set = 'data = data, has_hacker_news_references = false'
      break
    default:
      throw new Error('Unknown RSS update mode')
  }
  const { rows } = await write<{ advanced: boolean; updated_at: string }>(
    `/* updateRssContentForTest */ UPDATE rss_feed_items SET ${set} WHERE id = $1
     RETURNING updated_at::text, updated_at > $2::timestamptz AS advanced`,
    [itemId, previous],
  )
  return rows[0]!
}

/** Synthetic valid tally used to exercise Wilson cancellation on the stored relation columns. */
export async function seedTinyPositiveRelatedUrlScoreForTest(postId: string, urlId: string) {
  const { rows } = await write<{ votes_score_net: number; votes_score_sort: number }>(
    `/* seedTinyPositiveRelatedUrlScoreForTest */
    UPDATE relation__post__related__url SET votes_score_up = $3, votes_score_none = 1, votes_score_down = 0
    WHERE subject_id = $1::uuid AND object_id = $2::uuid
    RETURNING votes_score_net, votes_score_sort`,
    [postId, urlId, 1e-16],
  )
  return rows[0]
}
