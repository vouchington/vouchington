# Entity × Action Matrix reference

[Back to Entity × Action Matrix](ENTITY-ACTION-MATRIX.md)

## Table B — Entity × Action × Description

Each row describes one action on one entity: its UI label, predicate (from [entity-relations.md](../overview/architecture/entity-relations.md)), description, API endpoint, and primary component.

Accounts with Voucha roles, `is_agent`, or reserved system usernames are **official accounts**. Official accounts are excluded from **sentiment trust-signal actions** (post/topic/feed votes, user vouch, reviews, data points, personal referral endorsements). They may vote on **structural entity relations** (tags, categories, FAQs, related links) and publish **official platform referral links** (admin-only, surfaced as "Use our official links"). See [Official Account Permissions](trust-safety/reference-trust-system-official-accounts-and-material-connections.md#official-account-permissions) for the full matrix.

### Contents

- <a id="rss_feed_item"></a>[`rss_feed_item`](reference-rssfeeditem.md)
- <a id="post"></a>[`post`](reference-post.md)
- <a id="comment"></a>[`comment`](reference-comment.md)
- <a id="topic"></a>[`topic`](reference-topic.md)
- <a id="rss_feed"></a>[`rss_feed`](reference-rssfeed.md)
- <a id="user"></a>[`user`](reference-user.md)
- <a id="domain"></a>[`domain`](reference-domain.md)
- <a id="community"></a>[`community`](reference-community.md)
- <a id="community_list"></a>[`community_list`](reference-communitylist.md)
- <a id="list"></a>[`list`](reference-list.md)
- <a id="recommendation"></a>[`recommendation`](reference-recommendation.md)
- <a id="rss_feed_item-podcast-episode"></a>[`rss_feed_item` (podcast episode)](reference-rssfeeditem-podcast-episode.md)
- <a id="rss_feed_item_category-admin-only"></a>[`rss_feed_item_category` (admin-only)](reference-rssfeeditemcategory-admin-only.md)
