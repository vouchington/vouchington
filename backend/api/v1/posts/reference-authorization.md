# Authorization

[Back to Posts API](README.md#authorization)

Authorization is handled via [authorization.mts](../../../services/posts/authorization.mts):

- Create: Requires login AND (username OR OAuth account). Admins bypass this check. Returns 403 if user has neither.
- Update/Delete: Creator or admin only
- Read routes must hide unauthorized content as `404`, not `403`
- Single-post read routes (`GET /:idOrSlug`, `/descendants`, `/ancestors`, `/images`) must:
  - keep the requested candidate post as the returned entity
  - enforce publication state on both the candidate and its root post
  - hide an ancestor-tree response when any embedded post is not directly visible
- View published:
  - `broadcast='everyone'` + `privacy='public'`: public
  - `privacy='public'` with any restricted `broadcast`: public by URL, but still hidden from unauthorized feeds/search
  - `privacy='private'`: creator, admins, and the selected `broadcast` audience only
- `/api/v1/posts` search/listing must stay aligned with the same visibility rules and exclude restricted posts from unauthorized viewers

Anonymous posts mask `created_by_id` and `created_by` for everyone except the creator and admins.
Anonymous updates must also mask `updated_by_id` and `updated_by` for everyone except the creator and admins.
