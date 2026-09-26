# PATCH /api/v1/posts/:idOrSlug

[Back to Posts API](README.md#patch-apiv1postsidorslug)

Updates a post. Requires authentication as the creator or an admin.

Hidden/deleted and ownership checks precede detailed body diagnostics. `ai_summary_markdown` is an
accepted update field for administrators only; the service retains that guard when the route's
generated body schema accepts the field.

**Edit window restriction:** Changes to `title`, `markdown`, `structured_data`, or `categories` are only allowed within 24 hours of post creation. After 1 day, attempting to update these fields returns `403` with error code `POST_CONTENT_EDIT_WINDOW_EXPIRED`. Admins bypass this restriction. Other fields (`broadcast`, `privacy`, `is_anonymous`, `slug`) remain editable regardless of post age.
