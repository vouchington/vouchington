import { beginTransaction } from '@data-stores/psql'
import { contentHash, postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

// Five old rows per recent row (including back catalogue) make an unbounded scan fail.
export async function seedTopHashtags(): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows: aliases } = await transaction<{ id: string }>(
    `/* seedTopHashtagsAlias */ SELECT id FROM topic_aliases WHERE alias = 'seed-alias-0'`,
  )
  const aliasId = aliases[0]?.id
  if (!aliasId) throw new Error('Top hashtag seed requires seed-alias-0')
  const postIds = [
    ...Array.from({ length: 60 }, (_, i) => seedUuid(1000 + i, '05')),
    ...Array.from({ length: 300 }, (_, i) => seedUuid(65_000 + i, '05')),
  ]
  await transaction(
    `/* seedTopHashtagsPosts */ INSERT INTO post_topic_alias_sources
      (post_id, topic_alias_id, contributor_user_id, source, authored_token)
     SELECT id, $2, created_by_id, 'explicit', 'SeedHashtag'
     FROM posts WHERE id = ANY($1::uuid[]) ON CONFLICT DO NOTHING`,
    [postIds, aliasId],
  )
  await transaction(
    `/* seedTopHashtagsPostVotes */ INSERT INTO relation__post__category__topic_alias
      (subject_id, object_id, created_by_id, votes_score_up)
     SELECT id, $2, created_by_id, 1 FROM posts WHERE id = ANY($1::uuid[])
     ON CONFLICT DO NOTHING`,
    [postIds, aliasId],
  )
  const rssRows = Array.from({ length: 432 }, (_, i) => {
    const old = i >= 72
    const backCatalogue = i >= 60 && !old
    const timestamp = postSeedTimestampMs(old ? 65_000 + i : 1000 + i)
    return {
      id: seedUuidAtTimestamp(timestamp, 900_000 + i),
      hostname_id: seedUuid(i % 3, '02'),
      feed_id: seedUuid(i % 3, '08'),
      url_id: seedUuid(2500 + (i % 600), '03'),
      guid: `seed-top-hashtags-${i}`,
      data: {
        title: `Hashtag item ${i}`,
        isoDate: new Date(backCatalogue ? postSeedTimestampMs(65_000) : timestamp).toISOString(),
      },
    }
  })
  await transaction(
    `/* seedTopHashtagsIdentities */ INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
     SELECT id, hostname_id, guid FROM jsonb_to_recordset($1::jsonb)
       AS seed(id uuid, hostname_id uuid, guid text) ON CONFLICT DO NOTHING`,
    [JSON.stringify(rssRows)],
  )
  await transaction(
    `/* seedTopHashtagsItems */ INSERT INTO rss_feed_items
      (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
     SELECT id, url_id, data, $2 FROM jsonb_to_recordset($1::jsonb)
       AS seed(id uuid, url_id uuid, data jsonb) ON CONFLICT DO NOTHING`,
    [JSON.stringify(rssRows), contentHash('seed-top-hashtags')],
  )
  await transaction(
    `/* seedTopHashtagsSources */ INSERT INTO rss_feed_item_sources
      (rss_feed_id, rss_feed_item_id, published_at)
     SELECT seed.feed_id, seed.id, item.published_at
     FROM jsonb_to_recordset($1::jsonb) AS seed(id uuid, feed_id uuid)
     JOIN rss_feed_items item ON item.id = seed.id ON CONFLICT DO NOTHING`,
    [JSON.stringify(rssRows)],
  )
  await transaction(
    `/* seedTopHashtagsCategories */ INSERT INTO rss_feed_item_categories
      (rss_feed_item_id, category_text, topic_alias_id)
     SELECT id, 'SeedHashtag', $2 FROM jsonb_to_recordset($1::jsonb) AS seed(id uuid)
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(rssRows), aliasId],
  )
  await transaction(
    `/* seedTopHashtagsRssVotes */ INSERT INTO relation__rss_feed_item__category__topic_alias
      (subject_id, object_id, created_by_id, votes_score_up)
     SELECT id, $2, $3, 1 FROM jsonb_to_recordset($1::jsonb) AS seed(id uuid)
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(rssRows), aliasId, seedUuid(0, '01')],
  )
  await transaction.commit()
}
