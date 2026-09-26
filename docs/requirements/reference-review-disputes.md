# Review Disputes

[Back to Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-table-a-entity-flow-authorization-page-component.md#review-disputes)

| Entity              | Flow        | Authorization     | Page/Route       | Component (file:line)                               | Notes                                                           |
| ------------------- | ----------- | ----------------- | ---------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `review_dispute`    | Create      | Verified claimant | Post detail page | `web/components/disputes/dispute-review-button.tsx` | Requires verified topic_claim for the reviewed topic            |
| `review_dispute`    | View-Status | Self (disputant)  | `/my/disputes`   | `web/components/disputes/member-dispute-row.tsx`    | Redacted view; public_response shown only after sent_at         |
| `review_dispute`    | Edit-Draft  | Moderator         | `/disputes`      | `web/components/disputes/dispute-row.tsx`           | Moderator edits public_response before approve                  |
| `review_dispute`    | Approve     | Moderator         | `/disputes`      | `web/components/disputes/dispute-row.tsx`           | Sets approved_at; required before Send                          |
| `review_dispute`    | Send        | Moderator         | `/disputes`      | `web/components/disputes/dispute-row.tsx`           | Delivers approved public_response to disputant via notification |
| `review_dispute`    | Resolve     | Moderator         | `/disputes`      | `web/components/disputes/dispute-row.tsx`           | Remove review, dismiss, or annotate                             |
| `review_dispute`    | Re-run-AI   | Moderator         | `/disputes`      | `web/components/disputes/dispute-row.tsx`           | Re-drafts AI recommendation                                     |
| `moderation_appeal` | Create      | Any signed-in     | Warning/ban page | `web/lib/api/client/appeals.ts`                     | Filed against a warning, community ban, or post removal         |
| `moderation_appeal` | View-Status | Self (appellant)  | `/my/appeals`    | `web/components/appeals/member-appeal-row.tsx`      | Redacted view; public_response shown only after sent_at         |
| `moderation_appeal` | Edit-Draft  | Moderator         | `/appeals`       | `web/components/appeals/appeal-row.tsx`             | Moderator edits public_response before approve                  |
| `moderation_appeal` | Approve     | Moderator         | `/appeals`       | `web/components/appeals/appeal-row.tsx`             | Sets approved_at; required before Send                          |
| `moderation_appeal` | Send        | Moderator         | `/appeals`       | `web/components/appeals/appeal-row.tsx`             | Delivers approved public_response to appellant via notification |
| `moderation_appeal` | Resolve     | Moderator         | `/appeals`       | `web/components/appeals/appeal-row.tsx`             | Accept (lift), reduce (partial), or deny the appeal             |
| `moderation_appeal` | Re-run-AI   | Moderator         | `/appeals`       | `web/components/appeals/appeal-row.tsx`             | Re-drafts AI recommendation                                     |

The controlled [review-dispute dialog](../../web/components/disputes/dispute-review-dialog.tsx)
owns its draft-reset lifecycle: closing schedules the reset, while reopening or unmounting cancels
the pending reset so an active draft is retained.

---
