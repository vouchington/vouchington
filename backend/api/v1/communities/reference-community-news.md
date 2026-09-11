# Community News

[Back to Communities API](README.md#community-news)

`GET /api/v1/communities/:idOrSlug/news` returns the RSS feed item feed for a single community.
The query is scoped to active `rss_feed` and `topic` community list items. Public communities are
readable without authentication and receive public `Cache-Control`; private communities use the
same visibility rules as the community detail route. Signed-in viewers additionally receive
personal sidecars such as bookmarks and election votes.
