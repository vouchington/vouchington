import { read, write } from '@data-stores/psql'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { List, ListItem } from '@voucha/types/entities/list'

type InsertTestListOptions = {
  ownerUserId: string
  name: string
  description?: string | null
  visibility?: 'private' | 'unlisted' | 'public'
  provenance?: ContentProvenance
}

export async function insertTestList(options: InsertTestListOptions): Promise<List> {
  const { rows } = await write(
    `/* insertTestList */
    INSERT INTO user_lists (owner_user_id, name, description, visibility, created_via, created_via_oauth_client_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, owner_user_id, name, description, visibility, created_at, updated_at, removed_at
    `,
    [
      options.ownerUserId,
      options.name,
      options.description ?? null,
      options.visibility ?? 'private',
      options.provenance?.createdVia ?? 'system',
      options.provenance?.oauthClientId ?? null,
    ],
  )
  const row = rows[0]!
  return {
    __entity_type: 'list',
    id: row.id as string,
    owner_user_id: row.owner_user_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    visibility: (row.visibility as 'private' | 'unlisted' | 'public') ?? 'private',
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    removed_at: (row.removed_at as Date | null) ?? null,
  }
}

type InsertTestListRssFeedItemOptions = {
  listId: string
  rssFeedItemId: string
}

export async function insertTestListRssFeedItem(
  options: InsertTestListRssFeedItemOptions,
): Promise<ListItem> {
  const { rows } = await write(
    `/* insertTestListRssFeedItem */
    INSERT INTO user_list_rss_feed_items (user_list_id, rss_feed_item_id)
    VALUES ($1, $2)
    RETURNING id, user_list_id AS list_id, rss_feed_item_id AS entity_id, order_index, created_at
    `,
    [options.listId, options.rssFeedItemId],
  )
  const row = rows[0]!
  return {
    __entity_type: 'list_item',
    id: row.id as string,
    list_id: row.list_id as string,
    item_type: 'rss_feed_item',
    entity_id: row.entity_id as string,
    order_index: (row.order_index as number) ?? 0,
    created_at: row.created_at as Date,
    media_type: null,
  }
}

export async function listPostItemExists(listId: string, postId: string): Promise<boolean> {
  const { rows } = await read(
    'SELECT 1 FROM user_list_posts WHERE user_list_id = $1 AND post_id = $2 AND removed_at IS NULL',
    [listId, postId],
  )
  return rows.length > 0
}

export async function listPostItemCount(listId: string, postId: string): Promise<number> {
  const { rows } = await read(
    'SELECT COUNT(*)::int AS cnt FROM user_list_posts WHERE user_list_id = $1 AND post_id = $2 AND removed_at IS NULL',
    [listId, postId],
  )
  return (rows[0] as { cnt: number }).cnt
}

export async function listRssFeedItemsFromFeedExist(
  listId: string,
  rssFeedId: string,
  rssFeedItemId: string,
): Promise<boolean> {
  const { rows } = await read(
    `SELECT li.rss_feed_item_id FROM user_list_rss_feed_items li
     JOIN rss_feed_item_sources src ON src.rss_feed_item_id = li.rss_feed_item_id
     WHERE li.user_list_id = $1 AND src.rss_feed_id = $2 AND li.removed_at IS NULL`,
    [listId, rssFeedId],
  )
  return rows.some((r: Record<string, unknown>) => r.rss_feed_item_id === rssFeedItemId)
}
