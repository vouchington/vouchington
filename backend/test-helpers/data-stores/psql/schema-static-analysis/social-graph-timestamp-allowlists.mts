/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const SOCIAL_GRAPH_TABLES_WITHOUT_CREATED_AT = new Map<string, string>([
  ['user_followers', 'Pure user-follow join table.'],
  [
    'follower_distribution_selected_recipients',
    'Immutable selected-recipient membership; distribution timestamps own the lifecycle.',
  ],
  ['user_topic_follows', 'Pure user-topic follow join table.'],
  ['user_topic_mutes', 'Pure user-topic mute join table.'],
])
/* v8 ignore stop */
