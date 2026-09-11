# POST /api/v1/topics/:sourceIdOrSlug/merges

[Back to Topics API](README.md#post-apiv1topicssourceidorslugmerges)

Admin-only alias merge. The source topic is marked merged, all source aliases move to the destination,
and the source slug is added as a destination alias. Posts, follows, feeds, ratings, relations, and
community list items stay attached to their existing topics.

**Request:**

```json
{ "destination_id_or_slug": "destination-topic" }
```

Topic deletion is intentionally unsupported. `DELETE /api/v1/topics/:idOrSlug` returns `405`.
