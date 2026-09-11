# Admin Navigation Matrix reference

[Back to Admin Navigation Matrix](ADMIN-NAVIGATION-MATRIX.md)

## Table B — `post`

| Action  | Description                                                                | Route                 | File path                                     | Navigation path(s)                                 |
| ------- | -------------------------------------------------------------------------- | --------------------- | --------------------------------------------- | -------------------------------------------------- |
| Approve | Approve a pending post from the review queue, making it publicly visible.  | `/posts/review-queue` | `web/app/(posts)/posts/review-queue/page.tsx` | sidebar: CMS → Review Queue; command: Review Queue |
| Reject  | Reject a pending post from the review queue, removing it from publication. | `/posts/review-queue` | `web/app/(posts)/posts/review-queue/page.tsx` | sidebar: CMS → Review Queue; command: Review Queue |
