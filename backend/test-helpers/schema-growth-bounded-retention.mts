import { COPYRIGHT_RETENTION_BOUNDED_TABLES } from './copyright-schema-growth.mts'
export const RETENTION_BOUNDED_TABLES = new Map<string, string>([
  ...COPYRIGHT_RETENTION_BOUNDED_TABLES,
  [
    'copyright_notice_operational_retention_cursors',
    'The finite copyright operational-retention family enum permits one durable keyset cursor per family.',
  ],
  [
    'copyright_notice_retention_generations',
    'The checked singleton records one global legal-preservation change generation.',
  ],
  [
    'copyright_notice_operational_retention_cursors',
    'The finite copyright operational-retention family enum permits one durable keyset cursor per family.',
  ],
  [
    'copyright_notice_retention_generations',
    'The checked singleton records one global legal-preservation change generation.',
  ],
  [
    'ai_usage_provider_response_keys',
    'A key younger than the response replay window protects its raw usage row; bounded raw folding later deletes that row and cascades the key.',
  ],
  [
    'stripe_event_processing_work_items',
    'Unfinished Stripe processing state remains while terminal work older than 30 days is deleted by bounded UUIDv7 keyset cleanup; immutable stripe_events retain deduplication.',
  ],
  [
    'membership_purchase_intents',
    'Live subscription and native launch replays remain; unlaunched, failed, ownerless, or provider-expired intents with expiry over 30 days ago and no verification reference are deleted by bounded UUIDv7 keyset cleanup.',
  ],
  [
    'payment_operational_cleanup_cursors',
    'One persisted keyset position per payment operational cleanup stream.',
  ],
  [
    'email_address_login_tokens',
    'Bounded cleanup deletes login and verification tokens older than one day.',
  ],
  ['phone_number_login_tokens', 'Bounded cleanup deletes SMS login tokens older than one day.'],
  [
    'auth_session_retention_cleanup_cursors',
    'A finite cleanup-name primary key permits one durable cursor per retention family.',
  ],
  [
    'history_retention_cursors',
    'The finite eight-value cleanup-name primary key permits one durable cursor per history family.',
  ],
  ['user_sessions', 'Bounded cleanup deletes expired sessions after the audit retention window.'],
  [
    'user_agent_string_cleanup_candidates',
    'One candidate per lookup row is retired by the bounded age-gated orphan check; a later session or ballot release recreates it, so cardinality follows recent lookup traffic and pending cleanup work.',
  ],
  [
    'web_push_subscriptions',
    'Bounded cleanup deletes aged subscription tombstones after push receipts expire.',
  ],
  [
    'notification_push_intents',
    'Pending intents older than 30 days and terminal intents older than 90 days are deleted by capped daily retention sweeps.',
  ],
  [
    'notification_push_intent_subscription_receipts',
    'Endpoint receipts cascade when their bounded-lifetime push intent is deleted.',
  ],
  [
    'notification_push_intent_retention_cursors',
    'A checked singleton tracks the bounded pending-intent sweep.',
  ],
])
