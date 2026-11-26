import { write } from '@data-stores/psql'
import { getCommunityListItemStorageConfig } from '@services/communities/list-items/catalog'
import { getCommunityListFeedLimit } from '@services/lists/import-config'
import { seedTopicId, seedUser } from '../run-support.mts'

export const COMMUNITY_URL_PAGE_MAX = 100
const REMOVED_MEMBERSHIPS = 24

async function seedMemberships(
  communityIds: string[],
  kind: 'url' | 'rss_feed',
  entityIds: string[],
) {
  const { table, entityColumn } = getCommunityListItemStorageConfig(kind)
  const { rows } = await write<{ membership_ids: string[] }>(
    `/* seedCommunityUrlFeedListMemberships */
    WITH inserted AS (
      INSERT INTO ${table} (community_id, ${entityColumn}, order_index, added_by_id, removed_at)
      SELECT community_id, item_id, (n - 1) / 3, $4,
        CASE WHEN n <= $3::int THEN CURRENT_TIMESTAMP END
      FROM unnest($1::uuid[]) AS scope(community_id)
      CROSS JOIN unnest($2::uuid[]) WITH ORDINALITY AS item(item_id, n)
      RETURNING id, community_id, order_index, removed_at
    )
    SELECT array_agg(id ORDER BY order_index, id) AS membership_ids
    FROM inserted WHERE community_id = ($1::uuid[])[1] AND removed_at IS NULL`,
    [communityIds, entityIds, REMOVED_MEMBERSHIPS, seedUser.id],
  )
  return rows[0]!.membership_ids
}

async function seedCountSiblings(communityId: string): Promise<number> {
  const { rows } = await write<{ hostname_membership_count: number }>(
    `/* seedCommunityUrlFeedCountSiblings */
    WITH topic_memberships AS (
      INSERT INTO community_list_topics (community_id, topic_id, removed_at)
      VALUES ($1, $2, NULL), ($1, $2, CURRENT_TIMESTAMP)
      RETURNING id
    ), posts_to_add AS (
      SELECT id FROM posts WHERE root_post_id IS NULL AND community_id IS NULL AND post_type = 'discussion'
        AND approved_at IS NOT NULL AND deleted_at IS NULL AND archived_at IS NULL
        AND privacy = 'public' AND broadcast = 'everyone'
      ORDER BY id LIMIT 1
    ), post_membership AS (
      INSERT INTO community_list_posts (community_id, post_id)
      SELECT $1, id FROM posts_to_add RETURNING id
    ), hostnames AS (
      (SELECT id FROM url_hostnames WHERE publicly_introduced_at IS NOT NULL AND NOT is_blocked ORDER BY id LIMIT 1)
      UNION ALL
      (SELECT id FROM url_hostnames WHERE publicly_introduced_at IS NULL OR is_blocked ORDER BY id LIMIT 1)
    ), host_memberships AS (
      INSERT INTO community_list_url_hostnames (community_id, url_hostname_id)
      SELECT $1, id FROM hostnames RETURNING id
    )
    SELECT (
      (SELECT count(*) FROM community_list_url_hostnames) +
      (SELECT count(*) FROM host_memberships)
    )::int AS hostname_membership_count`,
    [communityId, seedTopicId],
  )
  return rows[0]!.hostname_membership_count
}

export async function seedCommunityUrlFeedLists(communityIds: string[]) {
  const feedCap = getCommunityListFeedLimit()
  const {
    rows: [ids],
  } = await write<{ urls: string[]; rss_feeds: string[] }>(
    `/* selectCommunityUrlFeedListTargets */
    SELECT
      ARRAY(SELECT id FROM urls ORDER BY id LIMIT $1) AS urls,
      ARRAY(SELECT id FROM rss_feeds WHERE deleted_at IS NULL AND hard_delete_requested_at IS NULL
        ORDER BY id LIMIT $2) AS rss_feeds`,
    [COMMUNITY_URL_PAGE_MAX + 1 + REMOVED_MEMBERSHIPS, feedCap + REMOVED_MEMBERSHIPS],
  )
  const urlIds = await seedMemberships(communityIds, 'url', ids!.urls)
  const rssFeedIds = await seedMemberships(communityIds, 'rss_feed', ids!.rss_feeds)
  const hostnameMemberships = await seedCountSiblings(communityIds[0]!)
  return { urlIds, rssFeedIds, feedCap, hostnameMemberships }
}
