import { seedUuid } from './common.mts'
import { PUBLICATION_SCOPE_SEED } from './publication-scope-pages.mts'
import { beginTransaction, write } from '@data-stores/psql'

/** Settle visibility and owner selectivity on the dedicated, disposable hot corpus. */
export async function preparePublicationScopePlans(): Promise<void> {
  for (const table of [
    'posts',
    'topics',
    'post_topic_alias_sources',
    'relation__post__category__topic_alias',
    'rss_feed_categories',
    'rss_feed_item_categories',
  ] as const) {
    // no-mistakes-disable-next-line query-reached-per-item: six fixed fixture relations need separate VACUUM statements outside transactions before their owning captures.
    await write(`/* preparePublicationScopePlans */ VACUUM (ANALYZE) ${table}`)
  }
}

export async function preparePublicationHardDeletePlans(): Promise<void> {
  const seed = PUBLICATION_SCOPE_SEED
  const negativeIds = Array.from({ length: seed.negativeFeedCount }, (_, index) =>
    seedUuid(index, 'ee'),
  )
  {
    await using query = await beginTransaction()
    await query(
      `/* preparePublicationHardDeletePlans:negativeOwners */
    INSERT INTO rss_feeds (id,rss_feed_url_id,topic_id,title,created_via,deleted_at)
    SELECT id,$2::uuid,$3::uuid,'Scope negative owner','system',CURRENT_TIMESTAMP
    FROM unnest($1::uuid[]) input(id) ON CONFLICT DO NOTHING`,
      [negativeIds, seed.url, seed.negativeTopic],
    )
    await query(
      `/* preparePublicationHardDeletePlans:distributeOwnedNegativeCategories */
    WITH owned AS (
      SELECT category_identity_id, row_number() OVER (ORDER BY category_identity_id) AS ordinal
      FROM rss_feed_categories WHERE rss_feed_id=$1::uuid AND topic_id=$2::uuid
    )
    UPDATE rss_feed_categories category
    SET rss_feed_id=($3::uuid[])[((owned.ordinal-1)%$4::int+1)::int]
    FROM owned WHERE category.rss_feed_id=$1::uuid
      AND category.category_identity_id=owned.category_identity_id`,
      [seed.feed, seed.negativeTopic, negativeIds, seed.negativeFeedCount],
    )
    await query(
      `/* preparePublicationHardDeletePlans:sparseOwner */
    INSERT INTO rss_feeds (id,rss_feed_url_id,topic_id,title,created_via,deleted_at)
    VALUES ($1,$2,$3,'Scope sparse owner','system',CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING`,
      [seed.descriptorFeed, seed.url, seed.topic],
    )
    await query(
      `/* preparePublicationHardDeletePlans:sparseCategory */
    INSERT INTO rss_category_identities (id,category_text)
    VALUES ($1,'seed-publication-scope-next-page') ON CONFLICT DO NOTHING`,
      [seed.descriptorCategory],
    )
    await query(
      `/* preparePublicationHardDeletePlans:sparseMapping */
    INSERT INTO rss_feed_categories (rss_feed_id,category_identity_id,topic_id)
    VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [seed.descriptorFeed, seed.descriptorCategory, seed.topic],
    )
    await query(
      `/* preparePublicationHardDeletePlans:mark */ UPDATE rss_feeds
    SET deleted_at = CURRENT_TIMESTAMP, hard_delete_requested_at = CURRENT_TIMESTAMP
    WHERE id = ANY($1::uuid[])`,
      [[seed.feed, seed.descriptorFeed]],
    )
    await query.commit()
  }
  await write('/* analyzePublicationHardDeletePlans */ ANALYZE rss_feeds, rss_feed_categories')
}
