import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { VOTE_SCHEMA_CONFIGS } from './config-driven/utils/election-schema-config.mts'
import {
  buildUnboundedUnpartitionedTables,
  EXPLICIT_BOUNDED_TABLES,
  NON_DEFAULT_ID_EXCEPTIONS,
  STATIC_IDENTITY_EXCEPTIONS,
} from './schema-growth-classification.mts'

export { EXPLICIT_BOUNDED_TABLES, NON_DEFAULT_ID_EXCEPTIONS, STATIC_IDENTITY_EXCEPTIONS }

export type SchemaGrowthClass = 'bounded' | 'unbounded'
export type SchemaIdPolicy = 'uuidv7' | 'natural-or-provider' | 'static-identity' | 'no-id'
export type PartitionAccessClass = 'target-scoped' | 'retention-window' | 'intentional-fanout'

export type PartitionPolicy = {
  strategy: 'RANGE' | 'LIST -> RANGE'
  key: string
  children: 'default' | 'monthly' | 'list-default-range'
  retentionOwner: 'cleanupPartitions' | null
  accessClass: PartitionAccessClass
}

export type SchemaGrowthRegistryEntry = {
  table: string
  growth: SchemaGrowthClass
  idPolicy: SchemaIdPolicy
  idPolicyRationale: string
  partition: PartitionPolicy | null
  noPartitionRationale?: string
  reconsiderPartitioningWhen?: string
}

const defaultRange = (key: string): PartitionPolicy => ({
  strategy: 'RANGE',
  key,
  children: 'default',
  retentionOwner: null,
  accessClass: 'target-scoped',
})

const monthlyRange = (key: string): PartitionPolicy => ({
  strategy: 'RANGE',
  key,
  children: 'monthly',
  retentionOwner: 'cleanupPartitions',
  accessClass: 'retention-window',
})

const UNBOUNDED_RECONSIDERATION_EXCEPTIONS = new Map([
  [
    'ai_usage_openai_response_keys',
    'Only if the replacement preserves global response-id uniqueness across every ledger partition.',
  ],
  [
    'web_push_endpoint_owners',
    'Only if the replacement preserves global endpoint uniqueness and claim serialization across every subscription partition.',
  ],
])

const PARTITION_POLICY_ENTRIES: [string, PartitionPolicy][] = [
  ['posts', defaultRange('id')],
  ['rss_feed_items', defaultRange('id')],
  ['post_review_topic_ratings', defaultRange('post_id')],
  ['post_data_point_topics', defaultRange('post_id')],
  ['post_explicit_topic_categories', defaultRange('post_id')],
  ['post_topic_recommendations', defaultRange('post_id')],
  ['post_autotagger_results', defaultRange('post_id')],
  ['agent_moderations', defaultRange('post_id')],
  ['rss_feed_crawls', monthlyRange('id')],
  ['post_publication_projection_receipts', defaultRange('post_id')],
  ['post_publication_dirty_work_keys', defaultRange('dirty_work_id')],
  ['post_revisions', defaultRange('id')],
  ['ai_usage_records', defaultRange('id')],
  ['post_clearance_changes', defaultRange('id')],
  ['community_post_review_changes', defaultRange('id')],
  ['user_sessions', defaultRange('id')],
  ['session_referral_attributions', defaultRange('id')],
  ['conversation_messages', defaultRange('conversation_id')],
  ['notifications', defaultRange('user_id')],
  ['web_push_subscriptions', defaultRange('user_id')],
  ['post_feed_shares', defaultRange('recipient_user_id')],
  ['rss_feed_item_feed_shares', defaultRange('recipient_user_id')],
  ['post_read_states', defaultRange('user_id')],
  ['rss_feed_item_read_states', defaultRange('user_id')],
  ['conversation_message_agentic_runs', monthlyRange('id')],
  ['conversation_message_agentic_runs_events', monthlyRange('conversation_message_agentic_run_id')],
  ['agent_responses', monthlyRange('id')],
  ['crawls', monthlyRange('id')],
  ['crawl_chunks', monthlyRange('crawl_id')],
  ...VOTE_SCHEMA_CONFIGS.map(({ voteTable, entityIdColumn }): [string, PartitionPolicy] => [
    voteTable,
    defaultRange(entityIdColumn),
  ]),
  ...entityRelationMetadatum.flatMap(({ subject_type, table_name }): [string, PartitionPolicy][] =>
    subject_type === 'post' ? [[table_name, defaultRange('subject_id')]] : [],
  ),
  [
    'entity_relation_votes',
    {
      strategy: 'LIST -> RANGE',
      key: 'relation_table -> entity_relation_id',
      children: 'list-default-range',
      retentionOwner: null,
      accessClass: 'intentional-fanout',
    },
  ],
  ...entityRelationMetadatum.flatMap((metadata): [string, PartitionPolicy][] =>
    metadata.election
      ? [[getEntityRelationVoteTableName(metadata), defaultRange('entity_relation_id')]]
      : [],
  ),
]

export const PARTITION_POLICIES = new Map(PARTITION_POLICY_ENTRIES)
export const UNBOUNDED_UNPARTITIONED_TABLES = buildUnboundedUnpartitionedTables(
  new Set(PARTITION_POLICIES.keys()),
)

export function buildSchemaGrowthRegistry(
  tables: ReadonlyMap<string, { idPolicy: SchemaIdPolicy; idPolicyRationale: string }>,
): SchemaGrowthRegistryEntry[] {
  return [...tables]
    .map(([table, id]) => {
      const partition = PARTITION_POLICIES.get(table) ?? null
      const unboundedRationale = UNBOUNDED_UNPARTITIONED_TABLES.get(table)
      const boundedRationale = EXPLICIT_BOUNDED_TABLES.get(table)
      if (!partition && !unboundedRationale && !boundedRationale) {
        throw new Error(`Unclassified schema growth table: ${table}`)
      }
      const growth: SchemaGrowthClass = boundedRationale ? 'bounded' : 'unbounded'
      const noPartitionRationale = partition ? undefined : (unboundedRationale ?? boundedRationale)
      return {
        table,
        growth,
        ...id,
        partition,
        ...(noPartitionRationale
          ? {
              noPartitionRationale,
              reconsiderPartitioningWhen: unboundedRationale
                ? (UNBOUNDED_RECONSIDERATION_EXCEPTIONS.get(table) ??
                  'At approximately one million rows or measured planner/write pressure.')
                : 'If the documented bounded-cardinality invariant changes.',
            }
          : {}),
      }
    })
    .toSorted((left, right) => left.table.localeCompare(right.table))
}
