# Post Moderation reference

[Back to Post Moderation](POST-MODERATION.md)

## API Routes

| Method   | Route                                         | Auth requirement                                                                                                   |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PATCH`  | `/api/v1/posts/:idOrSlug`                     | Author or admin                                                                                                    |
| `DELETE` | `/api/v1/posts/:idOrSlug`                     | Author, admin, or community mod (comment-type only)                                                                |
| `GET`    | `/api/v1/posts/review-queue`                  | Admin or site moderator; provider-neutral disposition, reason-code, evidence-summary, and media-reveal fields only |
| `POST`   | `/api/v1/posts/:idOrSlug/clearances`          | Admin or site moderator; body `{ status, reason_code, private_note? }`; writes a platform override                 |
| `GET`    | `/api/v1/communities/:slug/posts/pending`     | Community owner/moderator                                                                                          |
| `PATCH`  | `/api/v1/communities/:slug/posts/:postId`     | Community owner/moderator or admin; body `{ status: 'approved' \| 'rejected' \| 'unpublished', reason? }`          |
| `GET`    | `/api/v1/communities/:slug/reports/pending`   | Community owner/moderator                                                                                          |
| `PATCH`  | `/api/v1/communities/:slug/reports/:reportId` | Community owner/moderator for scoped post/comment reports; body `{ status: 'reviewed' \| 'dismissed' }`            |
| `GET`    | `/api/v1/communities/:slug/pinned-posts`      | Public                                                                                                             |
| `PUT`    | `/api/v1/communities/:slug/pinned-posts`      | Community owner/moderator                                                                                          |
| `POST`   | `/api/v1/reports`                             | Any signed-in user                                                                                                 |
