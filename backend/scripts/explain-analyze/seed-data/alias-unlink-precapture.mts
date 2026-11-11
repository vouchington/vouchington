import { beginTransaction, write } from '@data-stores/psql'
import { postPublicationWorkMaxValues } from '@services/post-publication/work-limits'
import { seedUuid } from './common.mts'
import { PUBLICATION_SCOPE_SEED as seed } from './publication-scope-pages.mts'

export const ALIAS_UNLINK_ITEM_COUNT =
  postPublicationWorkMaxValues.topic_alias_unlink_page_size * 2 + 1
const ITEM_COUNT = ALIAS_UNLINK_ITEM_COUNT
const ALIAS_NOISE_COUNT = 4000
export const ALIAS_UNLINK_HASHTAG_ID = seedUuid(ALIAS_NOISE_COUNT + 2, 'e3')
export const ALIAS_UNLINK_MARK_ID = seedUuid(ALIAS_NOISE_COUNT + 3, 'e3')

export async function seedAliasUnlinkFixture(): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* seedAliasUnlinkAliasNoise */
     INSERT INTO topic_aliases (id, topic_id, alias)
     SELECT format('019e0000-e300-7000-8000-%s', lpad(to_hex(n + 2), 12, '0'))::uuid,
       $1::uuid, 'seed-publication-alias-noise-' || n
     FROM generate_series(0, $2::integer - 1) n ON CONFLICT DO NOTHING`,
    [seed.topic, ALIAS_NOISE_COUNT],
  )
  await query(
    `/* seedAliasUnlinkControlAliases */
     INSERT INTO topic_aliases (id, topic_id, alias)
     VALUES ($1::uuid, $3::uuid, 'seed-publication-alias-guard'),
       ($2::uuid, $3::uuid, 'seed-publication-mark-probe')
     ON CONFLICT DO NOTHING`,
    [ALIAS_UNLINK_HASHTAG_ID, ALIAS_UNLINK_MARK_ID, seed.topic],
  )
  await query(
    `/* seedAliasUnlinkHashtagSource */
     INSERT INTO post_topic_alias_sources
       (post_id, topic_alias_id, contributor_user_id, source, authored_token)
     SELECT post_id, $2::uuid, contributor_user_id, source, '#seed-publication-alias-guard'
     FROM post_topic_alias_sources
     WHERE topic_alias_id = $1::uuid
     ORDER BY post_id, id LIMIT 1 ON CONFLICT DO NOTHING`,
    [seed.alias, ALIAS_UNLINK_HASHTAG_ID],
  )
  await query(
    `/* seedAliasUnlinkGuidRows */
     INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
     SELECT format('019e0000-ed00-7000-8000-%s', lpad(to_hex(n), 12, '0'))::uuid,
       $1::uuid, 'seed-publication-alias-' || n
     FROM generate_series(0, $2::integer - 1) n ON CONFLICT DO NOTHING`,
    ['019e0000-0200-7000-8000-000000000000', ITEM_COUNT],
  )
  await query(
    `/* seedAliasUnlinkItems */
     INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
     SELECT id, $1::uuid, '{}'::jsonb, decode(repeat('00', 32), 'hex')
     FROM rss_feed_item_guids WHERE id >= $2::uuid AND id < $3::uuid
     ON CONFLICT DO NOTHING`,
    [seed.url, '019e0000-ed00-7000-8000-000000000000', itemEndId()],
  )
  await query(
    `/* seedAliasUnlinkItemCategories */
     INSERT INTO rss_feed_item_categories
       (rss_feed_item_id, category_identity_id, category_text, topic_id, topic_alias_id)
     SELECT item.id, identity.id, identity.category_text, $1::uuid, $2::uuid
     FROM rss_feed_items item
     JOIN rss_category_identities identity
       ON identity.id = ('019e0000-ec00-7000-8000-' || right(item.id::text, 12))::uuid
     WHERE item.id >= $3::uuid AND item.id < $4::uuid
     ON CONFLICT DO NOTHING`,
    [seed.topic, seed.alias, '019e0000-ed00-7000-8000-000000000000', itemEndId()],
  )
  await query(
    `/* seedAliasUnlinkUnrelatedMappedCategories */
     INSERT INTO rss_feed_item_categories
       (rss_feed_item_id, category_identity_id, category_text, topic_id, topic_alias_id)
     SELECT item.id, identity.id, identity.category_text, $1::uuid, $2::uuid
     FROM generate_series(0, $3::integer - 1) AS item_number(n)
     JOIN rss_feed_items item
       ON item.id = format('019e0000-ed00-7000-8000-%s', lpad(to_hex(item_number.n), 12, '0'))::uuid
     CROSS JOIN generate_series(0, 9) AS ordinal(k)
     JOIN rss_category_identities identity
       ON identity.id = format('019e0000-e600-7000-8000-%s',
         lpad(to_hex((item_number.n * 10 + ordinal.k) % $4::integer), 12, '0'))::uuid
     ON CONFLICT DO NOTHING`,
    [seed.negativeTopic, seed.negativeAlias, ITEM_COUNT, seed.count],
  )
  await query(
    `/* seedAliasUnlinkItemRelations */
     INSERT INTO relation__rss_feed_item__category__topic_alias
       (subject_id, object_id, created_by_id, votes_score_up)
     SELECT id, $1::uuid, $2::uuid, 1 FROM rss_feed_items
     WHERE id >= $3::uuid AND id < $4::uuid ON CONFLICT DO NOTHING`,
    [seed.alias, seed.author, '019e0000-ed00-7000-8000-000000000000', itemEndId()],
  )
  await query(
    `/* seedAliasUnlinkMarkRelation */
     INSERT INTO relation__rss_feed_item__category__topic_alias
       (subject_id, object_id, created_by_id, votes_score_up)
     SELECT id, $1::uuid, $2::uuid, 1 FROM rss_feed_items
     WHERE id >= $3::uuid AND id < $4::uuid
     ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING`,
    [ALIAS_UNLINK_MARK_ID, seed.author, '019e0000-ed00-7000-8000-000000000000', itemEndId()],
  )
  await query(
    `/* seedAliasUnlinkPending */ UPDATE topic_aliases
     SET topic_id = NULL, unlink_topic_id = $2::uuid, unlink_requested_at = CURRENT_TIMESTAMP
     WHERE id = ANY($1::uuid[])`,
    [[seed.alias, ALIAS_UNLINK_HASHTAG_ID], seed.topic],
  )
  await query.commit()
  await write(
    '/* analyzeAliasUnlinkFixture */ ANALYZE post_topic_alias_sources, relation__post__category__topic_alias, rss_feed_item_categories, relation__rss_feed_item__category__topic_alias, topic_aliases',
  )
}

export async function cleanupAliasUnlinkFixture(): Promise<void> {
  await using query = await beginTransaction()
  const bounds = ['019e0000-ed00-7000-8000-000000000000', itemEndId()]
  await query(
    `/* cleanupAliasUnlinkRelations */ DELETE FROM relation__rss_feed_item__category__topic_alias WHERE object_id = ANY($1::uuid[])`,
    [[seed.alias, ALIAS_UNLINK_MARK_ID]],
  )
  await query(
    `/* cleanupAliasUnlinkHashtagSource */ DELETE FROM post_topic_alias_sources
     WHERE topic_alias_id = $1::uuid`,
    [ALIAS_UNLINK_HASHTAG_ID],
  )
  await query(
    `/* cleanupAliasUnlinkCategories */ DELETE FROM rss_feed_item_categories WHERE rss_feed_item_id >= $1::uuid AND rss_feed_item_id < $2::uuid`,
    bounds,
  )
  await query(
    `/* cleanupAliasUnlinkItems */ DELETE FROM rss_feed_items WHERE id >= $1::uuid AND id < $2::uuid`,
    bounds,
  )
  await query(
    `/* cleanupAliasUnlinkGuids */ DELETE FROM rss_feed_item_guids WHERE id >= $1::uuid AND id < $2::uuid`,
    bounds,
  )
  await query(
    `/* cleanupAliasUnlinkPending */ UPDATE topic_aliases SET topic_id = $2::uuid, unlink_topic_id = NULL, unlink_requested_at = NULL WHERE id = $1::uuid AND unlink_requested_at IS NOT NULL`,
    [seed.alias, seed.topic],
  )
  await query(
    `/* cleanupAliasUnlinkControlAliases */ DELETE FROM topic_aliases
     WHERE id = ANY($1::uuid[])`,
    [[ALIAS_UNLINK_HASHTAG_ID, ALIAS_UNLINK_MARK_ID]],
  )
  await query(
    `/* cleanupAliasUnlinkAliasNoise */ DELETE FROM topic_aliases
     WHERE id >= $1::uuid AND id < $2::uuid`,
    [seedUuid(2, 'e3'), seedUuid(ALIAS_NOISE_COUNT + 2, 'e3')],
  )
  await query.commit()
  await write(
    '/* analyzeCleanedAliasUnlinkFixture */ ANALYZE post_topic_alias_sources, relation__post__category__topic_alias, rss_feed_item_categories, relation__rss_feed_item__category__topic_alias, topic_aliases',
  )
}

function itemEndId(): string {
  return `019e0000-ed00-7000-8000-${ITEM_COUNT.toString(16).padStart(12, '0')}`
}
