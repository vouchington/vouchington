import { write } from '@data-stores/psql'

/** Makes the 1k alias feed page selective against unrelated categories. */
export async function seedAliasFeedNoise(): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* seedExplainAliasFeedNoise identities */
     INSERT INTO rss_category_identities (category_text)
     SELECT 'explain-alias-noise-' || n FROM generate_series(0, 9) AS n
     ON CONFLICT (category_text) DO UPDATE
       SET category_text = EXCLUDED.category_text RETURNING id`,
  )
  const ids = rows.map(row => row.id)
  await write(
    `/* seedExplainAliasFeedNoise categories */
     INSERT INTO rss_feed_categories (rss_feed_id, category_identity_id)
     SELECT feed.id, identity.id
     FROM (SELECT id FROM rss_feeds ORDER BY id LIMIT 2000) feed
     CROSS JOIN UNNEST($1::uuid[]) identity(id)
     ON CONFLICT DO NOTHING`,
    [ids],
  )
  return ids
}

export async function removeAliasFeedNoise(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await write(
    `/* removeExplainAliasFeedNoise */
    DELETE FROM rss_feed_categories WHERE category_identity_id = ANY($1::uuid[])`,
    [ids],
  )
}

export async function rearmAliasFanIn(
  identityId: string,
  table: 'rss_feed_categories' | 'rss_feed_item_categories',
) {
  await write(
    `/* rearmExplainAliasFanIn */ UPDATE ${table}
     SET topic_id = NULL WHERE category_identity_id = $1::uuid`,
    [identityId],
  )
}
