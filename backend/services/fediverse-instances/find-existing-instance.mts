import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

type InstanceLookupResult = { topic_id: string; topic_slug: string }

/**
 * Finds an existing fediverse_instance topic for a hostname.
 *
 * Unlike RSS's findExistingFeedByUrlId/findExistingFeedByUrl (which intentionally span ALL
 * topic lifecycle states), this filters to ACTIVE topics only (deleted_at IS NULL AND
 * merged_into_topic_id IS NULL). The two dedup constraints differ structurally: RSS's
 * rss_feed_url_id uniqueness is NOT partial, so its lookup must match feeds whose topic was
 * later merged/soft-deleted or unique-violation errors would surface downstream. This service's
 * dedup constraint (idx_topics__fediverse_instance__hostname_id) IS a partial index scoped to
 * active topics, so a merged/soft-deleted instance topic must NOT block creating a new active
 * one for the same hostname — filtering here keeps the lookup aligned with what the database
 * actually allows.
 */
export async function findExistingInstanceByHostnameId(
  hostnameId: string,
): Promise<InstanceLookupResult | null> {
  const { rows } = await read(sql`/* findExistingInstanceByHostnameId */
    SELECT id AS topic_id, slug AS topic_slug
    FROM topics
    WHERE hostname_id = ${hostnameId}
      AND topic_type = 'fediverse_instance'
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
    LIMIT 1
  `)
  return (rows[0] as InstanceLookupResult | undefined) ?? null
}
