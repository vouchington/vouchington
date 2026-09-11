# PATCH /api/v1/posts/:idOrSlug

[Back to Posts API](README.md#patch-apiv1postsidorslug)

Updates a post. Requires authentication as the creator or an admin.

**Edit window restriction:** Changes to `title`, `markdown`, `structured_data`, or `categories` are only allowed within 24 hours of post creation. After 1 day, attempting to update these fields returns `403` with error code `POST_CONTENT_EDIT_WINDOW_EXPIRED`. Admins bypass this restriction. Other fields (`broadcast`, `privacy`, `is_anonymous`, `slug`) remain editable regardless of post age.
