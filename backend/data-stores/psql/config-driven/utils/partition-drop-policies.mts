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
  /** Each predicate must have a matching partial index on the partition parent. */
  inFlightPredicates?: readonly string[]
}

/** A null minimum makes retirement fail closed until the table owner chooses a window. */
export const PARTITION_DROP_POLICIES: Record<string, PartitionDropPolicy> = Object.fromEntries(
  [
    ...POST_PARTITION_TABLES,
    ...USER_DATA_REQUEST_PARTITION_TABLES,
    ...CLASSIFIER_RESULT_PARTITION_TABLES,
    ...USER_SESSION_PARTITION_TABLES,
    ...USER_KEY_PARTITION_TABLES,
    ...DEFERRED_LEDGER_PARTITION_TABLES,
  ].map(table => [table, { minimumRetentionDays: null }]),
)

for (const config of ALL_MONTHLY_PARTITION_TABLES) {
  PARTITION_DROP_POLICIES[config.table] = {
    minimumRetentionDays: config.retentionDays ?? null,
    legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
    ...(config.table === 'crawls' && {
      inFlightPredicates: ['completed_at IS NULL', 'has_pending_embeddings = TRUE'],
    }),
    ...(config.table === 'crawl_chunks' && {
      inFlightPredicates: ['bedrock_nova_multimodal_v1_embedding_created_at IS NULL'],
    }),
  }
}

for (const config of COPYRIGHT_HISTORY_PARTITION_TABLES) {
  PARTITION_DROP_POLICIES[config.table] = {
    minimumRetentionDays: config.retentionDays ?? null,
    minimumRetentionMonths: 72,
    legalBasis: 'docs/requirements/moderation/COPYRIGHT-NOTICES.md#evidence-retention',
    copyrightHistory: true,
  }
}

for (const table of CLASSIFIER_RESULT_PARTITION_TABLES) {
  PARTITION_DROP_POLICIES[table] = {
    minimumRetentionDays: 90,
    legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
  }
}

PARTITION_DROP_POLICIES.user_data_requests = {
  minimumRetentionDays: 30,
  legalBasis: 'docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md',
}
PARTITION_DROP_POLICIES.user_data_request_attempts = {
  minimumRetentionDays: 30,
  legalBasis: 'docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md',
}

PARTITION_DROP_POLICIES.topic_revisions = {
  minimumRetentionDays: null,
  minimumRetentionMonths: 12,
  legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
  retirementReferenceTables: ['topics', 'users'],
}

PARTITION_DROP_POLICIES.post_revisions = {
  minimumRetentionDays: null,
  minimumRetentionMonths: 72,
  legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
  retirementReferenceTables: ['posts', 'users'],
}

// Security call audits may be retired only after the privacy-policy window. The legal
// decision rationale lives with its copyright case and is not retained by this partition.
PARTITION_DROP_POLICIES['mcp_call_audit_events'] = {
  minimumRetentionDays: 366,
  legalBasis: 'articles/privacy-policy.md',
  legalHoldAccountColumn: 'actor_user_id',
}

// Owner-approved minimum for both transition histories. Retire only complete calendar months.
for (const table of ['post_clearance_changes', 'community_post_review_changes']) {
  PARTITION_DROP_POLICIES[table] = {
    minimumRetentionDays: null,
    minimumRetentionMonths: 72,
    legalBasis: 'docs/overview/architecture/partitioning-strategy.md',
    legalHoldAccountColumn: 'post_author_user_id',
  }
}
