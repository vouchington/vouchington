import { RETENTION_BOUNDED_TABLES } from './schema-growth-bounded-retention.mts'
import { EXTRA_BOUNDED_TABLES } from './schema-growth-bounded-extra.mts'

export const STATIC_IDENTITY_EXCEPTIONS = new Map<string, string>([
  ['countries', 'Small ISO country lookup populated from a fixed reference set.'],
  ['currencies', 'Small ISO currency lookup populated from a fixed reference set.'],
  ['domain_blocklist_sources', 'Small administrator-managed source lookup.'],
  ['media_types', 'Small validated MIME-type lookup shared by URLs, RSS and legal evidence.'],
  [
    'queue_domain_controls',
    'One optional pause row per code-registered background-queue domain, keyed by its stable identifier.',
  ],
  ['user_permission_types', 'Small static RBAC permission lookup.'],
  ['user_role_types', 'Small static RBAC role lookup.'],
])

const providerLookups = [
  ['stripe_event_types', 'Stripe event types'],
  ['amazon_ses_bounce_subtypes', 'SES bounce subtypes'],
  ['ai_service_tiers', 'model provider service tiers'],
  ['identity_document_types', 'Identity provider document types'],
] as const

export const PROVIDER_LOOKUP_BOUNDS = new Map<string, string>(
  providerLookups.map(([table, vocabulary]) => [
    table,
    `Distinct ${vocabulary} names, bounded by the upstream vocabulary rather than event traffic.`,
  ]),
)

export const EXPLICIT_BOUNDED_TABLES = new Map<string, string>([
  [
    'ai_usage_retention_cursors',
    'A checked singleton persists the cyclic UUIDv7 keyset position for AI usage folding.',
  ],
  ...PROVIDER_LOOKUP_BOUNDS,
  ...STATIC_IDENTITY_EXCEPTIONS,
  ...EXTRA_BOUNDED_TABLES,
  ...RETENTION_BOUNDED_TABLES,
  [
    'oauth_authorizations',
    'Authorization rows expire after ten minutes and data retention deletes terminal or expired rows, bounding cardinality to recent OAuth traffic.',
  ],
  ['migrations', 'The migration ledger has exactly one row per checked-in migration.'],
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
