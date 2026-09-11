# Community List Items Service

Handles CRUD operations for items in a community's curated lists of topics, RSS feeds, posts, domains, and URLs.

## What This Service Does

- **Add items** to a community list (requires owner/moderator role)
- **Remove items** from a community list via soft-delete (requires owner/moderator role)
- **Search items** in a community list with cursor pagination and optional filtering by entity type
- **Get counts** of items per entity type for subtab badges

## Data Model

Five parallel tables store list items, one per entity type. All tables share the same shape:

```
community_list_items__<type>
  id UUID DEFAULT uuidv7() PRIMARY KEY
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE
  <entity>_id UUID NOT NULL REFERENCES <entity_table> ON DELETE CASCADE
  order_index INT NOT NULL DEFAULT 0
  added_by_id UUID REFERENCES users ON DELETE SET NULL
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
  removed_at TIMESTAMPTZ
  removed_by_id UUID REFERENCES users ON DELETE SET NULL

  UNIQUE (community_id, <entity>_id) WHERE removed_at IS NULL
  INDEX on community_id WHERE removed_at IS NULL
```

Supported tables:

- `community_list_items__topics` (topic_id)
- `community_list_items__rss_feeds` (rss_feed_id)
- `community_list_items__posts` (post_id)
- `community_list_items__url_hostnames` (url_hostname_id)
- `community_list_items__urls` (url_id)

### View

`view_community_list_items` is a UNION ALL of all five tables, with columns:

- `id` — item UUID
- `community_id` — community
- `item_type` — literal string ('topic', 'rss_feed', 'post', 'url_hostname', 'url')
- `entity_id` — the FK column aliased (topic_id, rss_feed_id, etc.)
- `order_index` — display order
- `added_by_id` — user who added the item
- `created_at` — timestamp extracted from UUID
- `removed_at` — soft-delete timestamp

Only active items (removed_at IS NULL) are included.

## Authorization

Community list management requires ownership or moderator role:

- **Owner**: can add and remove items
- **Moderator**: can add and remove items
- **Member**: can view only
- **Non-member**: can view on public communities only

## Functions

### `searchCommunityListItems(communityId, options?)`

Search items in a community list with cursor pagination.

**Parameters:**

- `communityId: string` — community UUID
- `options?: { limit?: number, after?: string, item_type?: CommunityListItemType }`

**Returns:** `{ results: CommunityListItem[], page_info: PageInfo }`

**Usage:**

```typescript
const { results, page_info } = await searchCommunityListItems(communityId, {
  limit: 20,
  after: previousCursor,
  item_type: 'topic',
})
```

### `addCommunityListItem(currentUserId, communityId, itemType, entityId)`

Add an item to a community list.

**Parameters:**

- `currentUserId: string` — user adding the item (for audit)
- `communityId: string` — community UUID
- `itemType: CommunityListItemType` — 'topic', 'rss_feed', 'post', 'url_hostname', or 'url'
- `entityId: string` — UUID of the entity to add

**Returns:** `CommunityListItem`

**Throws:**

- HTTP 404 if community not found
- HTTP 403 if user is not owner/moderator
- HTTP 409 if item already in list
- HTTP 404 if entity not found

**Usage:**

```typescript
const item = await addCommunityListItem(userId, communityId, 'topic', topicId)
```

### `removeCommunityListItem(currentUserId, communityId, itemId, itemType)`

Remove an item from a community list via soft-delete.

**Parameters:**

- `currentUserId: string` — user removing the item (for audit)
- `communityId: string` — community UUID
- `itemId: string` — community_list_item UUID
- `itemType: CommunityListItemType` — for routing to correct table

**Returns:** void

**Throws:**

- HTTP 404 if item not found
- HTTP 403 if user is not owner/moderator

**Usage:**

```typescript
await removeCommunityListItem(userId, communityId, itemId, 'topic')
```

### `getCommunityListItemCounts(communityId)`

Get counts of active items per entity type.

**Parameters:**

- `communityId: string` — community UUID

**Returns:** `{ topic: number, rss_feed: number, post: number, url_hostname: number, url: number }`

**Usage:**

```typescript
const counts = await getCommunityListItemCounts(communityId)
// { topic: 5, rss_feed: 3, post: 12, url_hostname: 2, url: 8 }
```

## Entity Relations

List items are paired with entity relation bookmarks for virtual follow/mute:

- `relation__user__save__community` — user saves a community for reference
- `relation__user__proxy_follow__community` — user proxy-follows all topics and RSS feeds in the community
- `relation__user__proxy_mute__community` — user proxy-mutes all topics and RSS feeds in the community

These relations are defined in [`backend/services/entity-relations/config.mts`](../../entity-relations/config.mts) and auto-generated via idempotent migrations.

## Integration with Feed Queries

Community list items are used in feed queries to expand the scope of followed and muted content:

- **Feed CTEs** in [`backend/services/feeds/sql-builders/community-list-cte.mts`](../../feeds/sql-builders/community-list-cte.mts) query the list items tables
- **Post feed** ([`backend/services/feeds/posts/get-ids.mts`](../../feeds/posts/get-ids.mts)) UNIONs proxy-followed topics and excludes proxy-muted topics
- **RSS feed items** ([`backend/services/feeds/rss-feed-items/get-ids.mts`](../../feeds/rss-feed-items/get-ids.mts)) UNION proxy-followed feeds and topics, excludes proxy-muted feeds and topics

## Related

- [Community Lists requirements](../../../../docs/requirements/community/community-lists.md)
- [Communities service](../README.md)
- [Community authorization](../authorization.mts)
- [Entity relations](../../entity-relations/README.md)
