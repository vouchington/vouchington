/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const SOCIAL_GRAPH_TABLES_WITHOUT_CREATED_AT = new Map<string, string>([
  [
    'follower_distribution_selected_recipients',
    'Immutable selected-recipient membership; distribution timestamps own the lifecycle.',
  ],
])
/* v8 ignore stop */
