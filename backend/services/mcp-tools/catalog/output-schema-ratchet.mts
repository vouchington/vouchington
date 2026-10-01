// Ratchet: MCP tools that still return text only, with no declared output schema. This list can
// only shrink. Convert a tool by giving its `meta` an `outputSchema` (see
// backend/tools/route-response-schema.mts) and delete its name here. A tool newly exposed on `mcp`
// or `admin_mcp` must declare its output schema from the start; never add it to this list.
export const MCP_TOOLS_WITHOUT_OUTPUT_SCHEMA: readonly string[] = [
  'add_entity_relation',
  'compare_topics',
  'get_domain_ratings',
  'get_recommended_topics',
  'get_referral_links',
  'get_topic_details',
  'get_topic_hierarchy',
  'get_topic_insights',
  'get_topic_metrics',
  'get_trending_posts',
  'get_trending_topics',
  'get_wikipedia_summary',
  'manage_my_cards',
  'manage_my_point_valuations',
  'manage_my_rewards_statuses',
  'manage_my_spending',
  'search_data_points',
  'search_posts',
  'search_posts_semantic',
  'search_topics',
  'search_topics_semantic',
  'search_topics_text',
  'search_wikipedia',
  'update_my_financial_profile',
]

// Raising this number is what adding a name above costs, so the increase shows up in review.
export const MAX_MCP_TOOLS_WITHOUT_OUTPUT_SCHEMA = 24
