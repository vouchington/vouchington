# Community Lists reference

[Back to Community Lists](community-lists.md)

## Roles & Permissions

List management is gated by community membership roles:

| Role                           | View Lists | Manage Items |
| ------------------------------ | ---------- | ------------ |
| Non-member (public community)  | Yes        | No           |
| Non-member (private community) | No         | No           |
| Member                         | Yes        | No           |
| Moderator                      | Yes        | Yes          |
| Owner                          | Yes        | Yes          |

## Proxy Follow & Proxy Mute

Members can apply a single action to all topics and RSS feeds in a community's lists. These are not individual follows or mutes—they apply dynamically at query time.

### Proxy Follow

A user who proxy-follows a community will have all topics and RSS feeds in that community's lists automatically included in their personalized feed. No individual bookmarks are created.

- **Applies to**: topics, RSS feeds
- **Effect**: items appear in the user's News and Discussions feeds as if explicitly followed
- **Removes**: user can unapply proxy-follow at any time

### Proxy Mute

A user who proxy-mutes a community will have all topics and RSS feeds in that community's lists excluded from their personalized feed.

- **Applies to**: topics, RSS feeds
- **Effect**: items are excluded from all feed queries
- **Removes**: user can unapply proxy-mute at any time
- **Interaction with follow**: proxy-mute takes precedence; a topic from both a proxy-followed and proxy-muted community is excluded

## Managing List Items

Owners and moderators add items to a list using a labeled autocomplete panel. The entity type is determined by the active Lists dropdown item — there is no separate type selector. Selecting an item from the autocomplete immediately adds it to the list (no separate confirmation step). The input disables during submission and re-enables once the page refreshes.

Items are added via dedicated Lists dropdown destinations:

- Navigate to **Lists > Topics**, **Lists > Sources**, **Lists > Posts**, **Lists > Domains**, or **Lists > URLs**
- Type in the search input to find an entity by name
- Select a result — the item is added instantly with a toast confirmation
- Use the remove button on an item row to remove it from the list.
- Duplicate additions are rejected by the API (409) and surfaced as an error toast

## API Endpoints

List item APIs are organized by entity type. Each type has its own route prefix for type-safe responses.

### Topics List

- `GET /api/v1/communities/:idOrSlug/list-items/topics` — paginated list of topics in the community list
- `POST /api/v1/communities/:idOrSlug/list-items/topics` — add a topic (auth: owner/moderator)
- `DELETE /api/v1/communities/:idOrSlug/list-items/topics/:itemId` — remove a topic (auth: owner/moderator)

### RSS Feeds List

- `GET /api/v1/communities/:idOrSlug/list-items/rss-feeds` — paginated list of feeds in the community list
- `POST /api/v1/communities/:idOrSlug/list-items/rss-feeds` — add an RSS feed (auth: owner/moderator)
- `DELETE /api/v1/communities/:idOrSlug/list-items/rss-feeds/:itemId` — remove a feed (auth: owner/moderator)
- `GET /api/v1/communities/:idOrSlug/news` — paginated RSS feed items for the community's listed
  RSS feeds and topics. Optional `feed_type` values: `any`, `follow_rss_feeds`, `follow_topics`.

### Posts List

- `GET /api/v1/communities/:idOrSlug/list-items/posts` — paginated list of posts in the community list
- `POST /api/v1/communities/:idOrSlug/list-items/posts` — add a post (auth: owner/moderator)
- `DELETE /api/v1/communities/:idOrSlug/list-items/posts/:itemId` — remove a post (auth: owner/moderator)

### Domains List

- `GET /api/v1/communities/:idOrSlug/list-items/domains` — paginated list of hostnames in the community list
- `POST /api/v1/communities/:idOrSlug/list-items/domains` — add a hostname (auth: owner/moderator)
- `DELETE /api/v1/communities/:idOrSlug/list-items/domains/:itemId` — remove a hostname (auth: owner/moderator)

### URLs List

- `GET /api/v1/communities/:idOrSlug/list-items/urls` — paginated list of URLs in the community list
- `POST /api/v1/communities/:idOrSlug/list-items/urls` — add a URL (auth: owner/moderator)
- `DELETE /api/v1/communities/:idOrSlug/list-items/urls/:itemId` — remove a URL (auth: owner/moderator)

### Item Counts

- `GET /api/v1/communities/:idOrSlug/list-items/counts` — returns count of items per entity type, used for subtab badges: `{ topic: N, rss_feed: N, post: N, url_hostname: N, url: N }`

## List Visibility

### Public Communities

The Lists tab is visible to all users (members and non-members). Non-members can view the lists but cannot manage items.

### Private Communities

The Lists tab is visible only to community members. Non-members cannot see or access the lists.
