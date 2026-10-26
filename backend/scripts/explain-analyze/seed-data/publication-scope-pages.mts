import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const PUBLICATION_SCOPE_SEED = {
  author: seedUuid(0, 'e0'),
  community: seedUuid(0, 'e1'),
  topic: seedUuid(0, 'e2'),
  alias: seedUuid(0, 'e3'),
  root: seedUuid(0, 'e4'),
  count: 10_000,
}

/** Hot owners and duplicate category runs make LIMIT-before-filter/index regressions visible. */
export async function seedPublicationScopePages(): Promise<void> {
  const s = PUBLICATION_SCOPE_SEED
  await using query = await beginTransaction()
  await query(
    `/* seedPublicationScopePages:owners */
    INSERT INTO users (id, username) VALUES ($1, 'seed-publication-scope') ON CONFLICT DO NOTHING`,
    [s.author],
  )
  await query(
    `/* seedPublicationScopePages:community */
    INSERT INTO communities (id, name, slug, created_by_id, created_via)
    VALUES ($1, 'Scope seed', 'seed-publication-scope', $2, 'system') ON CONFLICT DO NOTHING`,
    [s.community, s.author],
  )
  await query(
    `/* seedPublicationScopePages:topic */
    INSERT INTO topics (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
    VALUES ($1, 'Scope seed', 'seed-publication-scope', 'system', decode(repeat('00',32),'hex')) ON CONFLICT DO NOTHING`,
    [s.topic],
  )
  await query(
    `/* seedPublicationScopePages:alias */
    INSERT INTO topic_aliases (id, topic_id, alias) VALUES ($1,$2,'seed-publication-scope') ON CONFLICT DO NOTHING`,
    [s.alias, s.topic],
  )
  await query(
    `/* seedPublicationScopePages:root */
    INSERT INTO posts (id, created_by_id, community_id, post_type, title, markdown, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    VALUES ($1,$2,$3,'discussion','Scope seed','Scope seed','system',decode(repeat('00',32),'hex'),decode(repeat('00',32),'hex')) ON CONFLICT DO NOTHING`,
    [s.root, s.author, s.community],
  )
  await query(
    `/* seedPublicationScopePages:posts */
    INSERT INTO posts (id, created_by_id, community_id, post_type, title, markdown, created_via,
      parent_post_id, root_post_id, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT ('019e0000-e500-7000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      $1,$2,'comment','Scope seed','Scope seed','system',$3,$3,decode(repeat('00',32),'hex'),decode(repeat('00',32),'hex')
    FROM generate_series(0,$4::int-1) n ON CONFLICT DO NOTHING`,
    [s.author, s.community, s.root, s.count],
  )
  await query(
    `/* seedPublicationScopePages:relations */
    INSERT INTO relation__post__category__topic_alias (subject_id, object_id, created_by_id, votes_score_up)
    SELECT id,$1,$2,CASE WHEN row_number() OVER (ORDER BY id) % 1000 = 0 THEN 1 ELSE 0 END
    FROM posts WHERE parent_post_id=$3 ON CONFLICT DO NOTHING`,
    [s.alias, s.author, s.root],
  )
  await query(
    `/* seedPublicationScopePages:sources */
    INSERT INTO post_topic_alias_sources (post_id,topic_alias_id,contributor_user_id,source,authored_token)
    SELECT p.id,$1,$2,source::post_topic_alias_source_types,'seed-publication-scope'
    FROM posts p CROSS JOIN (VALUES ('title'),('markdown'),('explicit')) source(source)
    WHERE parent_post_id=$3 ON CONFLICT DO NOTHING`,
    [s.alias, s.author, s.root],
  )
  await query(
    `/* seedPublicationScopePages:categoryIdentities */
    INSERT INTO rss_category_identities (category_text)
    SELECT 'seed-publication-scope-'||n FROM generate_series(0,$1::int-1) n ON CONFLICT DO NOTHING`,
    [s.count],
  )
  await query(
    `/* seedPublicationScopePages:negativeCategoryIdentities */
    INSERT INTO rss_category_identities (id,category_text)
    SELECT ('019e0000-e600-7000-8000-'||lpad(to_hex(n),12,'0'))::uuid,
      'seed-publication-scope-negative-'||n FROM generate_series(0,$1::int-1) n
    ON CONFLICT DO NOTHING`,
    [s.count],
  )
  await query(
    `/* seedPublicationScopePages:feedCategories */
    INSERT INTO rss_feed_categories (rss_feed_id,category_identity_id,topic_id)
    SELECT feed.id,c.id,$1 FROM rss_category_identities c
    CROSS JOIN (SELECT id FROM rss_feeds ORDER BY id LIMIT 1) feed
    WHERE c.category_text LIKE 'seed-publication-scope-%'
      AND c.category_text NOT LIKE 'seed-publication-scope-negative-%' ON CONFLICT DO NOTHING`,
    [s.topic],
  )
  await query(
    `/* seedPublicationScopePages:itemCategories */
    INSERT INTO rss_feed_item_categories (rss_feed_item_id,category_identity_id,category_text,topic_id)
    SELECT item.id,c.id,c.category_text,$1 FROM rss_category_identities c
    CROSS JOIN (SELECT id FROM rss_feed_item_guids ORDER BY id LIMIT 1) item
    WHERE c.category_text LIKE 'seed-publication-scope-%'
      AND c.category_text NOT LIKE 'seed-publication-scope-negative-%' ON CONFLICT DO NOTHING`,
    [s.topic],
  )
  await query(
    `/* seedPublicationScopePages:negativeFeedCategories */
    INSERT INTO rss_feed_categories (rss_feed_id,category_identity_id,topic_id)
    SELECT feed.id,c.id,$1 FROM rss_category_identities c
    CROSS JOIN (SELECT id FROM rss_feeds ORDER BY id LIMIT 1) feed
    WHERE c.category_text LIKE 'seed-publication-scope-negative-%' ON CONFLICT DO NOTHING`,
    [seedUuid(0, '04')],
  )
  await query(
    `/* seedPublicationScopePages:negativeItemCategories */
    INSERT INTO rss_feed_item_categories (rss_feed_item_id,category_identity_id,category_text,topic_id)
    SELECT item.id,c.id,c.category_text,$1 FROM rss_category_identities c
    CROSS JOIN (SELECT id FROM rss_feed_item_guids ORDER BY id LIMIT 1) item
    WHERE c.category_text LIKE 'seed-publication-scope-negative-%' ON CONFLICT DO NOTHING`,
    [seedUuid(0, '04')],
  )
  await query.commit()
}
