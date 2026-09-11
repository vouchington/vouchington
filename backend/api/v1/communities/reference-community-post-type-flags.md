# Community Post Type Flags

[Back to Communities API](README.md#community-post-type-flags)

Discussions are always allowed for active community members. Reviews and data points are opt-in per
community and default to disabled:

- `allow_review_posts` — enables community-scoped review creation
- `allow_data_point_posts` — enables community-scoped data point creation

Owners, moderators, and site administrators can update both flags via
`PATCH /api/v1/communities/:idOrSlug/post-type-settings`. The community post creation route rejects
disabled review/data-point posts before normal post validation.
