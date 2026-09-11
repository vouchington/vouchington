# Review Ratings

[Back to Posts API](README.md#review-ratings)

Review ratings are managed via individual CRUD endpoints (`/ratings` and `/ratings/:topicId`).
Do **not** update review ratings through `PATCH /api/v1/posts/:idOrSlug` — that endpoint handles post
metadata only (title, markdown, broadcast, privacy, is_anonymous). Rating updates must use the
dedicated endpoints, which operate on one rating row at a time within their own transactions.
