import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const PUBLICATION_SCOPE_SEED = {
  author: seedUuid(0, 'e0'),
  community: seedUuid(0, 'e1'),
  topic: seedUuid(0, 'e2'),
  negativeTopic: seedUuid(1, 'e2'),
  url: seedUuid(0, 'e7'),
  feed: seedUuid(0, 'e8'),
  descriptorFeed: seedUuid(1, 'e8'),
  descriptorCategory: seedUuid(0, 'ef'),
  negativeFeedCount: 1000,
  item: seedUuid(0, 'e9'),
  alias: seedUuid(0, 'e3'),
  negativeAlias: seedUuid(1, 'e3'),
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
    VALUES ($1, 'Scope seed', 'seed-publication-scope', 'system', decode(repeat('00',32),'hex')),
      ($2, 'Scope negative', 'seed-publication-scope-negative', 'system', decode(repeat('00',32),'hex')) ON CONFLICT DO NOTHING`,
    [s.topic, s.negativeTopic],
  )
  await query(
    `/* seedPublicationScopePages:mergedSources */
    INSERT INTO topics (id,name,slug,created_via,bedrock_nova_multimodal_v1_content_sha256,
      merged_into_topic_id,merged_at,merged_by_id)
    SELECT ('019e0000-ea00-7000-8000-'||lpad(to_hex(n),12,'0'))::uuid,
      'Scope merged '||n,'seed-publication-scope-merged-'||n,'system',decode(repeat('00',32),'hex'),$1,CURRENT_TIMESTAMP,$2
    FROM generate_series(0,$3::int-1) n ON CONFLICT DO NOTHING`,
    [s.topic, s.author, s.count],
  )
  await query(
    `/* seedPublicationScopePages:url */
    INSERT INTO urls (id,url,hostname_id,search_params)
    VALUES ($1,'https://seed-host-0.example.com/publication-scope.xml',$2,'{}'::jsonb)
    ON CONFLICT DO NOTHING`,
    [s.url, seedUuid(0, '02')],
  )
  await query(
    `/* seedPublicationScopePages:feed */
    INSERT INTO rss_feeds (id,rss_feed_url_id,topic_id,title,created_via)
    VALUES ($1,$2,$3,'Scope seed','system') ON CONFLICT DO NOTHING`,
    [s.feed, s.url, s.topic],
  )
  await query(
    `/* seedPublicationScopePages:itemIdentity */
    INSERT INTO rss_feed_item_guids (id,url_hostname_id,guid)
    VALUES ($1,$2,'seed-publication-scope-item') ON CONFLICT DO NOTHING`,
    [s.item, seedUuid(0, '02')],
  )
  await query(
    `/* seedPublicationScopePages:item */
    INSERT INTO rss_feed_items (id,url_id,data,bedrock_nova_multimodal_v1_content_sha256)
    VALUES ($1,$2,'{}'::jsonb,decode(repeat('00',32),'hex')) ON CONFLICT DO NOTHING`,
    [s.item, s.url],
  )
  await query(
    `/* seedPublicationScopePages:alias */
    INSERT INTO topic_aliases (id, topic_id, alias) VALUES ($1,$2,'seed-publication-scope'),
      ($3,$4,'seed-publication-scope-negative') ON CONFLICT DO NOTHING`,
    [s.alias, s.topic, s.negativeAlias, s.negativeTopic],
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
    SELECT id,$1::uuid,$3::uuid,CASE WHEN row_number() OVER (ORDER BY id) % 1000 = 0 THEN 1 ELSE 0 END
    FROM posts WHERE parent_post_id=$4
    UNION ALL SELECT id,$2::uuid,$3::uuid,0 FROM posts WHERE parent_post_id=$4 ON CONFLICT DO NOTHING`,
    [s.alias, s.negativeAlias, s.author, s.root],
  )
  await query(
    `/* seedPublicationScopePages:sources */
    INSERT INTO post_topic_alias_sources (post_id,topic_alias_id,contributor_user_id,source,authored_token)
    SELECT p.id,alias.topic_alias_id,$2,source::post_topic_alias_source_types,'seed-publication-scope'
    FROM posts p CROSS JOIN (VALUES ('title'),('markdown'),('explicit')) source(source)
    CROSS JOIN unnest($1::uuid[]) alias(topic_alias_id)
    WHERE parent_post_id=$3 ON CONFLICT DO NOTHING`,
    [[s.alias, s.negativeAlias], s.author, s.root],
  )
  await query(
    `/* seedPublicationScopePages:categoryIdentities */
    INSERT INTO rss_category_identities (id,category_text)
    SELECT ('019e0000-ec00-7000-8000-'||lpad(to_hex(n),12,'0'))::uuid,'seed-publication-scope-'||n FROM generate_series(0,$1::int-1) n ON CONFLICT DO NOTHING`,
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
    SELECT $2,c.id,$1 FROM rss_category_identities c
    WHERE c.category_text LIKE 'seed-publication-scope-%'
      AND c.category_text NOT LIKE 'seed-publication-scope-negative-%' ON CONFLICT DO NOTHING`,
    [s.topic, s.feed],
  )
  await query(
    `/* seedPublicationScopePages:itemCategories */
    INSERT INTO rss_feed_item_categories (rss_feed_item_id,category_identity_id,category_text,topic_id)
    SELECT $2,c.id,c.category_text,$1 FROM rss_category_identities c
    WHERE c.category_text LIKE 'seed-publication-scope-%'
      AND c.category_text NOT LIKE 'seed-publication-scope-negative-%' ON CONFLICT DO NOTHING`,
    [s.topic, s.item],
  )
  await query(
    `/* seedPublicationScopePages:negativeFeedCategories */
    INSERT INTO rss_feed_categories (rss_feed_id,category_identity_id,topic_id)
    SELECT $2,c.id,$1 FROM rss_category_identities c
    WHERE c.category_text LIKE 'seed-publication-scope-negative-%' ON CONFLICT DO NOTHING`,
    [s.negativeTopic, s.feed],
  )
  await query(
    `/* seedPublicationScopePages:negativeItemCategories */
    INSERT INTO rss_feed_item_categories (rss_feed_item_id,category_identity_id,category_text,topic_id)
    SELECT $2,c.id,c.category_text,$1 FROM rss_category_identities c
    WHERE c.category_text LIKE 'seed-publication-scope-negative-%' ON CONFLICT DO NOTHING`,
    [s.negativeTopic, s.item],
  )
  await query.commit()
}
