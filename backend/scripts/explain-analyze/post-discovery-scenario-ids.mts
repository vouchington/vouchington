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
  'post-discovery-mixed-recommendation-best',
  'post-discovery-community-new-missing-parent',
  'post-discovery-recommendation-new-exhausted',
] as const
