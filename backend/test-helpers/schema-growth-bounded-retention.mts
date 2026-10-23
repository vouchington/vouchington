export const RETENTION_BOUNDED_TABLES = new Map<string, string>([
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
  ['user_sessions', 'Bounded cleanup deletes expired sessions after the audit retention window.'],
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
