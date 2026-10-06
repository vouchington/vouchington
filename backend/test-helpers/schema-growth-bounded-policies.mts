import { EXTRA_BOUNDED_TABLES } from './schema-growth-bounded-extra.mts'

export const STATIC_IDENTITY_EXCEPTIONS = new Map<string, string>([
  ['countries', 'Small ISO country lookup populated from a fixed reference set.'],
  ['currencies', 'Small ISO currency lookup populated from a fixed reference set.'],
  ['domain_blocklist_sources', 'Small administrator-managed source lookup.'],
  ['media_types', 'Small validated MIME-type lookup shared by URLs, RSS and legal evidence.'],
  ['user_permission_types', 'Small static RBAC permission lookup.'],
  ['user_role_types', 'Small static RBAC role lookup.'],
])

const providerLookups = [
  ['stripe_event_types', 'Stripe event types'],
  ['amazon_ses_bounce_subtypes', 'SES bounce subtypes'],
  ['openai_service_tiers', 'OpenAI service tiers'],
  ['identity_document_types', 'Identity provider document types'],
] as const

export const PROVIDER_LOOKUP_BOUNDS = new Map<string, string>(
  providerLookups.map(([table, vocabulary]) => [
    table,
    `Distinct ${vocabulary} names, bounded by the upstream vocabulary rather than event traffic.`,
  ]),
)

export const PROVIDER_LOOKUP_ID_POLICIES = new Map(
  providerLookups.map(([table, vocabulary]) => [
    table,
    {
      policy: 'natural-or-provider' as const,
      rationale: `The provider owns this exact ${vocabulary} lookup key.`,
    },
  ]),
)

export const EXPLICIT_BOUNDED_TABLES = new Map<string, string>([
  ...PROVIDER_LOOKUP_BOUNDS,
  ...STATIC_IDENTITY_EXCEPTIONS,
  ...EXTRA_BOUNDED_TABLES,
  [
    'oauth_authorizations',
    'Authorization rows expire after ten minutes and data retention deletes terminal or expired rows, bounding cardinality to recent OAuth traffic.',
  ],
  ['migrations', 'The migration ledger has exactly one row per checked-in migration.'],
  [
    'entity_listener_reconciliation_cursors',
    'A checked singleton bounds the dispatcher high-water mark to one row.',
  ],
  [
    'openai_background_responses',
    'Rows are deleted by the compare-and-set claim as soon as usage is recorded, or by the sweeper reconciler once reconciled, bounding cardinality to recently in-flight background responses.',
  ],
  [
    'post_admission_claims',
    'One short-lived lease per in-flight admission reservation; release deletes the lease and reservation deletion cascades to it, bounding cardinality to concurrent admission work.',
  ],
  [
    'post_admission_reservations',
    'Committed replays expire after 48 hours, abandoned reservations are pruned after 48 hours, and bounded cleanup deletes both classes, bounding cardinality to recent admission traffic.',
  ],
  ['activitypub_inbox_delivery_storage_counters', 'Primary key permits one row.'],
])
