/** Minimum-retention drop policies for every partitioned table. */

import {
  ALL_MONTHLY_PARTITION_TABLES,
  CLASSIFIER_RESULT_PARTITION_TABLES,
  COPYRIGHT_HISTORY_PARTITION_TABLES,
  DEFERRED_LEDGER_PARTITION_TABLES,
  POST_PARTITION_TABLES,
  USER_DATA_REQUEST_PARTITION_TABLES,
  USER_KEY_PARTITION_TABLES,
  USER_SESSION_PARTITION_TABLES,
} from './partition-config.mts'

export type PartitionDropPolicy = {
  /** Null refuses every drop until the table owner specifies a minimum. */
  minimumRetentionDays: number | null
  /** Calendar-month minimum for monthly legal history; overrides approximate day windows. */
  minimumRetentionMonths?: number
  legalBasis?: string
  /** A partition-column FK to the held account's retained user identity. */
  legalHoldAccountColumn?: string
  /** History row is preserved by a legal hold on a copyright case party or review account. */
  copyrightHistory?: true
  /** Referenced tables whose FK teardown locks precede the history parent lock. */
  retirementReferenceTables?: readonly string[]
  /** The child is raw evidence whose rows are removed only after an atomic fold. */
  mustBeEmpty?: boolean
  /** Each predicate must have a matching partial index on the partition parent. */
  inFlightPredicates?: readonly string[]
}

type PolicyEntry = [string, PartitionDropPolicy]

const NULL_MINIMUM_POLICIES: PolicyEntry[] = [
  ...POST_PARTITION_TABLES,
  ...USER_DATA_REQUEST_PARTITION_TABLES,
  ...CLASSIFIER_RESULT_PARTITION_TABLES,
  ...USER_SESSION_PARTITION_TABLES,
  ...USER_KEY_PARTITION_TABLES,
  ...DEFERRED_LEDGER_PARTITION_TABLES,
].map(table => [table, { minimumRetentionDays: null }])

const MONTHLY_POLICIES: PolicyEntry[] = ALL_MONTHLY_PARTITION_TABLES.map(config => [
  config.table,
  {
    minimumRetentionDays: config.retentionDays ?? null,
    legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
    ...(config.table === 'crawls' && {
      inFlightPredicates: ['completed_at IS NULL', 'has_pending_embeddings = TRUE'],
    }),
    ...(config.table === 'crawl_chunks' && {
      inFlightPredicates: ['gemini_embedding_2_embedding_created_at IS NULL'],
    }),
  },
])

const COPYRIGHT_HISTORY_POLICIES: PolicyEntry[] = COPYRIGHT_HISTORY_PARTITION_TABLES.map(config => [
  config.table,
  {
    minimumRetentionDays: config.retentionDays ?? null,
    minimumRetentionMonths: 72,
    legalBasis: 'docs/requirements/moderation/COPYRIGHT-NOTICES.md#evidence-retention',
    copyrightHistory: true,
  },
])

const CLASSIFIER_RESULT_POLICIES: PolicyEntry[] = CLASSIFIER_RESULT_PARTITION_TABLES.map(table => [
  table,
  {
    minimumRetentionDays: 90,
    legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
  },
])

// Owner-approved minimum for both transition histories. Retire only complete calendar months.
// retirementReferenceTables lists every table on either side of the history table's foreign keys
// (outbound references and inbound referencing tables, per the schema snapshot). They are locked
// first so FK teardown cannot invert the lock order (see guard-and-retire-monthly-partition.mts).
const TRANSITION_HISTORY_REFERENCES: Readonly<Record<string, readonly string[]>> = {
  post_clearance_changes: ['moderation_training_feedbacks', 'posts', 'retained_user_identities'],
  community_post_review_changes: [
    'communities',
    'community_post_reviews',
    'retained_user_identities',
  ],
}

const TRANSITION_HISTORY_POLICIES: PolicyEntry[] = Object.entries(
  TRANSITION_HISTORY_REFERENCES,
).map(([table, retirementReferenceTables]) => [
  table,
  {
    minimumRetentionDays: null,
    minimumRetentionMonths: 72,
    legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
    legalHoldAccountColumn: 'post_author_user_id',
    retirementReferenceTables,
  },
])

/**
 * A null minimum makes retirement fail closed until the table owner chooses a window. A later
 * entry replaces an earlier entry for the same table.
 */
export const PARTITION_DROP_POLICIES: Record<string, PartitionDropPolicy> = Object.fromEntries([
  ...NULL_MINIMUM_POLICIES,
  ...MONTHLY_POLICIES,
  ...COPYRIGHT_HISTORY_POLICIES,
  ...CLASSIFIER_RESULT_POLICIES,
  [
    'user_data_requests',
    {
      minimumRetentionDays: 30,
      legalBasis: 'docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md',
    },
  ],
  [
    'user_data_request_attempts',
    {
      minimumRetentionDays: 30,
      legalBasis: 'docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md',
    },
  ],
  // Any row left after bounded folding, including protected replay usage, blocks DROP.
  [
    'ai_usage_records',
    {
      minimumRetentionDays: 180,
      legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
      mustBeEmpty: true,
      retirementReferenceTables: [
        'ai_usage_provider_response_keys',
        'communities',
        'posts',
        'classifier_run_identities',
        'ai_service_tiers',
        'currencies',
      ],
    },
  ],
  [
    'topic_revisions',
    {
      minimumRetentionDays: null,
      minimumRetentionMonths: 12,
      legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
      retirementReferenceTables: ['topics', 'users'],
    },
  ],
  [
    'post_revisions',
    {
      minimumRetentionDays: null,
      minimumRetentionMonths: 72,
      legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
      retirementReferenceTables: ['posts', 'users'],
    },
  ],
  // Security call audits may be retired only after the privacy-policy window. The legal
  // decision rationale lives with its copyright case and is not retained by this partition.
  [
    'mcp_call_audit_events',
    {
      minimumRetentionDays: 366,
      legalBasis: 'articles/privacy-policy.md',
      legalHoldAccountColumn: 'actor_user_id',
    },
  ],
  ...TRANSITION_HISTORY_POLICIES,
])
