# GET /api/v1/topics/publisher-types

[Back to Topics API](README.md#get-apiv1topicspublisher-types)

Returns the list of known publisher type topics (up to 8 items). No authentication required.

Response: `{ publisher_types: [{ id, slug, label }] }`

Results are backed by the `PUBLISHER_TYPES` constant in `ts-shared/utils/publisher-types.mts` and
are cached in-process for the lifetime of the server. Slugs are: `mainstream-media`,
`public-media`, `corporate-media`, `blog`, `aggregator`, `forum`, `ugc-platform`, `review`.
