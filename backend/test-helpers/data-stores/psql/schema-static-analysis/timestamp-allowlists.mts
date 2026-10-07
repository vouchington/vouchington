/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
import * as postPublication from './post-publication-allowlists.mts'
import * as postModeration from './moderation-ledger-allowlists.mts'
import { CLASSIFIER_RUN_TABLES_WITHOUT_CREATED_AT } from './classifier-run-allowlists.mts'
import { SOCIAL_GRAPH_TABLES_WITHOUT_CREATED_AT } from './social-graph-timestamp-allowlists.mts'
import { AUTHORIZATION_TABLES_WITHOUT_CREATED_AT } from './oauth-authorization-allowlists.mts'

export const ALLOWED_NON_UUIDV7_CREATED_AT = new Map<string, string>([])
export const ALLOWED_MISSING_CREATED_AT = new Map<string, string>([
  [
    'retained_image_placement_bindings',
    'Immutable placement identity allocated as UUIDv7; its creation time is derivable from placement_id.',
  ],
  ...postPublication.POST_PUBLICATION_TABLES_WITHOUT_CREATED_AT,
  ...AUTHORIZATION_TABLES_WITHOUT_CREATED_AT,
  [
    'rss_feed_item_guids',
    'Permanent identity lookup; creation time remains derivable from its UUIDv7 id and is never queried from the lookup.',
  ],
  ['rss_feed_item_read_states', 'Composite PK; read_at is the sole lifecycle timestamp.'],
  ['post_read_states', 'Composite PK; read_at is the sole lifecycle timestamp.'],
  ...postModeration.POST_MODERATION_TABLES_WITHOUT_CREATED_AT,
  ...CLASSIFIER_RUN_TABLES_WITHOUT_CREATED_AT,
  [
    'hostname_path_boilerplate_removal_urls',
    'Pure join table keyed by boilerplate removal and URL.',
  ],
  ['categories__related_categories', 'Pure relation table; relation timing is not queried.'],
  ['categories__related_topics', 'Pure relation table; relation timing is not queried.'],
  [
    'community_agent_prompts',
    'Extension table keyed by agent_prompts.id; timestamps live on the base prompt.',
  ],
  ['community_application_questions', 'Configuration child rows ordered inside a community.'],
  ['community_list_posts', 'Pure list membership table with added/removed lifecycle timestamps.'],
  [
    'community_list_rss_feeds',
    'Pure list membership table with added/removed lifecycle timestamps.',
  ],
  ['community_list_topics', 'Pure list membership table with added/removed lifecycle timestamps.'],
  [
    'community_list_url_hostnames',
    'Pure list membership table with added/removed lifecycle timestamps.',
  ],
  ['community_list_urls', 'Pure list membership table with added/removed lifecycle timestamps.'],
  ['community_pinned_posts', 'Pure ordered pin table.'],
  ['community_post_reviews', 'Review lifecycle timestamps model moderation state.'],
  ['currencies', 'Static lookup table.'],
  ['migrations', 'Internal migration ledger.'],
  ['pending_user_import_requests', 'Pending request table keyed by provider request ID.'],
  ['retailer_countries', 'Pure retailer-country join table.'],
  ['rss_feed_followers_by_session', 'Session follow join table without entity lifecycle.'],
  ['rss_feed_followers_by_user', 'User follow join table without entity lifecycle.'],
  ['totp_recovery_codes', 'Recovery code lifecycle is represented by used_at.'],
  ...SOCIAL_GRAPH_TABLES_WITHOUT_CREATED_AT,
])

/* v8 ignore stop */
