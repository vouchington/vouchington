# Fediverse Instance Anatomy reference

[Back to Fediverse Instance Anatomy](fediverse-instance.md)

## Surfaces

| Surface        | Route pattern              |
| -------------- | -------------------------- |
| Browse         | `/instances`               |
| Detail root    | `/instance/:idOrSlug`      |
| Detail subpage | `/instance/:idOrSlug/:tab` |

Both surfaces gate individually on the `fediverse` feature flag (`getEffectiveServerFeatureFlag('fediverse')`, `notFound()` when off) since they sit outside the `/fediverse/` route group — see
[FEDIVERSE.md § Scope](../content/FEDIVERSE.md#scope). Unlike `rss_feed`, there is no
`/instance/:idOrSlug/settings/source` page: the topic-type settings/source page guards on
`topic_type !== 'rss_feed'` and returns `notFound()` for every other type, including
`fediverse_instance` — instances have no RSS feed settings to manage.
