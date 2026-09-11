# CommunityMetrics Response Shape

[Back to Communities API](README.md#communitymetrics-response-shape)

```ts
{
  __entity_type: 'community_metrics',
  id: string,
  member_count: number,
  post_count: number,
  list_item_count: number,
  proxy_follow_count: number,
  proxy_mute_count: number,
  virtual_subscription_count: number  // proxy_follow_count + proxy_mute_count
}
```

`GET /api/v1/communities/:idOrSlug` always returns `community_metrics` at the top level of the response (not nested in a map).
