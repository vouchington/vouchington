/** Registered cases whose global fixtures require a fresh database. */
export const generalIsolatedCases = {
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
} as const
