# Posts

- Other domains write posts through service functions, including `insertStoryPostRecord()` for story posts.
- Publish immediately without draft state. Post category relations, actor/owner votes, and primary
  score refreshes belong to the create/update transaction; cache publication and notification
  reconciliation run after commit. Other creation listeners remain post-commit effects.
- Search hides flagged posts except from owners/admins. Validate review content before
  insert/update with the documented admin bypass.
- Topic recommendations follow normal post-discovery visibility in REST and MCP. Workflow-specific
  fields stay with the recommendation domain and do not bypass shared post eligibility. Embeddings
  include rationale and proposed topic payload.
- Lists use `buildPrivacyFilter()`; direct reads use `canViewPost()` and return 404 when unauthorized.
- Authorization lives in `authorization.mts`. Review ratings use individual CRUD, never bulk
  replacement through post PATCH.
