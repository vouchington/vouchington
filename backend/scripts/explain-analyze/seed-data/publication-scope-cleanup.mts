import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { PUBLICATION_SCOPE_SEED as s } from './publication-scope-pages.mts'

/** Reserved fixture identities only; old mappings can live on corpus feed/item rows. */
export async function cleanupPublicationScopePages(): Promise<void> {
  await using query = await beginTransaction()
  await query(`/* cleanupPublicationScopePages:feedCategories */
    DELETE FROM rss_feed_categories WHERE category_identity_id IN
      (SELECT id FROM rss_category_identities WHERE category_text LIKE 'seed-publication-scope-%')`)
  await query(`/* cleanupPublicationScopePages:itemCategories */
    DELETE FROM rss_feed_item_categories WHERE category_identity_id IN
      (SELECT id FROM rss_category_identities WHERE category_text LIKE 'seed-publication-scope-%')`)
  await query(`/* cleanupPublicationScopePages:categories */
    DELETE FROM rss_category_identities WHERE category_text LIKE 'seed-publication-scope-%'`)
  await query(
    `/* cleanupPublicationScopePages:sources */
    DELETE FROM post_topic_alias_sources WHERE topic_alias_id = ANY($1::uuid[])`,
    [[s.alias, s.negativeAlias]],
  )
  await query(
    `/* cleanupPublicationScopePages:relations */
    DELETE FROM relation__post__category__topic_alias WHERE object_id = ANY($1::uuid[])`,
    [[s.alias, s.negativeAlias]],
  )
  await query(
    `/* cleanupPublicationScopePages:comments */
    DELETE FROM posts WHERE id >= $1 AND id < $2`,
    [seedUuid(0, 'e5'), seedUuid(s.count, 'e5')],
  )
  await query(`/* cleanupPublicationScopePages:root */ DELETE FROM posts WHERE id = $1`, [s.root])
  await query(`/* cleanupPublicationScopePages:item */ DELETE FROM rss_feed_items WHERE id = $1`, [
    s.item,
  ])
  await query(
    `/* cleanupPublicationScopePages:itemGuid */ DELETE FROM rss_feed_item_guids WHERE id = $1`,
    [s.item],
  )
  await query(
    `/* cleanupPublicationScopePages:feed */ DELETE FROM rss_feeds
    WHERE id = ANY($1::uuid[]) OR (id >= $2::uuid AND id < $3::uuid)`,
    [[s.feed, s.descriptorFeed], seedUuid(0, 'ee'), seedUuid(s.negativeFeedCount, 'ee')],
  )
  await query(`/* cleanupPublicationScopePages:url */ DELETE FROM urls WHERE id = $1`, [s.url])
  await query(
    `/* cleanupPublicationScopePages:alias */ DELETE FROM topic_aliases WHERE id = ANY($1::uuid[])`,
    [[s.alias, s.negativeAlias]],
  )
  await query(
    `/* cleanupPublicationScopePages:mergedTopics */
    DELETE FROM topics WHERE id >= $1 AND id < $2`,
    [seedUuid(0, 'ea'), seedUuid(s.count, 'ea')],
  )
  await query(
    `/* cleanupPublicationScopePages:topics */ DELETE FROM topics WHERE id = ANY($1::uuid[])`,
    [[s.topic, s.negativeTopic]],
  )
  await query(
    `/* cleanupPublicationScopePages:community */ DELETE FROM communities WHERE id = $1`,
    [s.community],
  )
  await query(
    `/* cleanupPublicationScopePages:communityIdentity */
    DELETE FROM post_publication_community_identities WHERE id = $1`,
    [s.community],
  )
  await query(`/* cleanupPublicationScopePages:user */ DELETE FROM users WHERE id = $1`, [s.author])
  await query(
    `/* cleanupPublicationScopePages:postIdentities */
    DELETE FROM retained_post_identities WHERE id = $1 OR (id >= $2 AND id < $3)`,
    [s.root, seedUuid(0, 'e5'), seedUuid(s.count, 'e5')],
  )
  await query(
    `/* cleanupPublicationScopePages:itemIdentity */
    DELETE FROM retained_rss_feed_item_identities WHERE id = $1`,
    [s.item],
  )
  await query(
    `/* cleanupPublicationScopePages:topicIdentities */
    DELETE FROM retained_topic_identities WHERE id = ANY($1::uuid[]) OR (id >= $2 AND id < $3)`,
    [[s.topic, s.negativeTopic], seedUuid(0, 'ea'), seedUuid(s.count, 'ea')],
  )
  await query(
    `/* cleanupPublicationScopePages:userIdentity */ DELETE FROM retained_user_identities WHERE id = $1`,
    [s.author],
  )
  await query.commit()
}
