# GET /api/v1/topics/compare

[Back to Topics API](README.md#get-apiv1topicscompare)

Query parameters:

- `slugs` (required) — exactly two topic slugs or IDs, comma-separated

Returns `topics`, `topic_metrics`, `topic_elections`, `topic_categories`, and `data_point_insights`
keyed by topic ID. For authenticated users also: `bookmarks` and `election_votes`.
