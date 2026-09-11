# Post Moderation reference

[Back to Post Moderation](POST-MODERATION.md)

## Pages

| Page                                       | Who can access               | What it does                                                                                       |
| ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `/posts/review-queue`                      | Global admin                 | Global clearance review queue                                                                      |
| `/reports`                                 | Global admin                 | User-submitted moderation reports with reviewed/dismiss actions and links to moderation surfaces   |
| `/communities/:slug/posts`                 | Community viewers            | Community post feed with pinned posts and `new`/`hot` sorting                                      |
| `/communities/:slug/settings/moderation`   | Community owner/moderator    | Pre-publication pending posts queue and community-scoped pending reports                           |
| `/communities/:slug/settings/pinned-posts` | Community owner/moderator    | Manage pinned posts (up to 3)                                                                      |
| `/communities/:slug/settings/members`      | Community owner              | Manage members and roles                                                                           |
| Post detail page                           | Author, admin, community mod | Delete button (backend-gated via `can_delete`); Unpublish-from-community button for community mods |

Swift and .NET provide a dedicated global review queue for administrators. Both native clients
render the existing post, author, root-thread, spam-detection, and moderation context. They support
refresh, cursor pagination, approve, reject, and re-review through the clearance API. The native
queue acts on `rejected` and `in_review` records and filters unexpected `approved` or `pending`
records from the queue response. Other native moderation queues have separate capability
boundaries in [Moderation Flows](./MODERATION-FLOWS.md#native-client-capability-boundary-pipeline-diagram-and-post-clearance-gate) and the
[Client Parity Matrix](../CLIENT-PARITY-MATRIX.md).
