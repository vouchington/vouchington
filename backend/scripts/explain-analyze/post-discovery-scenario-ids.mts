const SCOPES = ['community', 'recommendation'] as const
const SORTS = ['new', 'best', 'hot', 'trending'] as const
const STATES = ['first', 'continuation', 'sparse', 'empty'] as const

export const POST_DISCOVERY_SCENARIO_IDS = [
  ...SCOPES.flatMap(scope =>
    SORTS.flatMap(sort => STATES.map(state => `post-discovery-${scope}-${sort}-${state}`)),
  ),
  'post-discovery-global-hot-first',
  'post-discovery-global-hot-continuation',
  'post-discovery-type-hot-first',
  'post-discovery-mixed-recommendation-new',
  'post-discovery-community-new-missing-parent',
  'post-discovery-recommendation-new-exhausted',
  'post-discovery-global-new-first',
  'post-discovery-global-new-finite-window-exhausted',
  'post-discovery-data-point-topic-new-finite-window-exhausted',
  'post-discovery-global-new-continuation',
  'post-discovery-author-new',
  'post-discovery-keyword-relevance-sparse-first',
  'post-discovery-keyword-relevance-empty-first',
  'post-discovery-global-hot-exclude-first',
  'post-discovery-community-best-exclude-first',
  'post-discovery-community-trending-week-first',
  'post-discovery-community-trending-week-continuation',
  'post-discovery-recommendation-trending-week-first',
  'post-discovery-recommendation-trending-week-continuation',
  'post-topic-semi-join-sparse-first',
  'post-topic-semi-join-dense-first',
  'post-topic-semi-join-dense-continuation',
  'post-topic-semi-join-multi-topic-search',
  'post-topic-semi-join-multi-topic-feed',
] as const
