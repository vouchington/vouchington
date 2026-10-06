/** Registered cases whose global fixtures require a fresh database. */
export const generalIsolatedCases = {
  'openai-moderation-reconciliation': {
    file: 'backend/workers/openai-moderation/workers/__tests__/workers.test.mts',
    fullName:
      'openai moderation single worker > requeues due source work and moves deadline-exhausted posts to review',
  },
  'semantic-post-window-cap': {
    file: 'backend/services/posts/search/__tests__/get-ids.semantic-window.test.mts',
    fullName:
      'semantic search candidate paging > ends pagination at the fixed window and counts the same candidates',
  },
  'semantic-post-window-selective': {
    file: 'backend/services/posts/search/__tests__/get-ids.semantic-window.test.mts',
    fullName:
      'semantic search candidate paging > fills a selective page and preserves distance ranking for semantic and hybrid queries',
  },

  'activitypub-expiry': {
    file: 'backend/services/ap-inbox-activities/durable-delivery-storage.test.mts',
    fullName:
      'ActivityPub inbox durable storage bounds > deletes expired rows in deterministic lease-aware locked batches',
  },
} as const
