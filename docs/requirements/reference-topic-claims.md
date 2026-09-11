# Topic Claims

[Back to Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-table-a-entity-flow-authorization-page-component.md#topic-claims)

| Entity        | Flow            | Authorization         | Page/Route                       | Component (file:line)                                       | Notes                                     |
| ------------- | --------------- | --------------------- | -------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| `topic_claim` | Claim           | Signed-in             | `/{topic-type}/:id` (topic page) | `web/components/topic-claims/claim-topic-form.tsx`          | Creates a pending claim for the topic     |
| `topic_claim` | Verify-Domain   | Owner (pending claim) | `/{topic-type}/:id` (topic page) | `web/components/topic-claims/domain-verification-panel.tsx` | DNS TXT or well-known file verification   |
| `topic_claim` | Submit-Evidence | Owner (pending claim) | `/{topic-type}/:id` (topic page) | `web/components/topic-claims/domain-verification-panel.tsx` | Manual review submission when no hostname |
| `topic_claim` | Verify-Approve  | Admin / Moderator     | `/admin/topic-claims`            | `web/components/admin/topic-claim-review.tsx`               | Admin approves pending claim → verified   |
| `topic_claim` | Reject          | Admin / Moderator     | `/admin/topic-claims`            | `web/components/admin/topic-claim-review.tsx`               | Admin rejects pending claim with reason   |
| `topic_claim` | Revoke          | Admin / Moderator     | `/admin/topic-claims`            | `web/components/admin/topic-claim-review.tsx`               | Admin revokes previously verified claim   |
