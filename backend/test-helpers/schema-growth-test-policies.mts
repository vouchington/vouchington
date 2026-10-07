import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import {
  PARTITION_POLICIES,
  UNBOUNDED_UNPARTITIONED_TABLES,
  type PartitionPolicy,
} from '../data-stores/psql/schema-growth-registry.mts'
import {
  EXPLICIT_BOUNDED_TABLES,
  PROVIDER_LOOKUP_ID_POLICIES,
} from './schema-growth-bounded-policies.mts'

export type SchemaGrowthClass = 'bounded' | 'unbounded'
export type SchemaIdPolicy = 'uuidv7' | 'natural-or-provider' | 'static-identity' | 'no-id'
export type SchemaGrowthRegistryEntry = {
  table: string
  growth: SchemaGrowthClass
  idPolicy: SchemaIdPolicy
  idPolicyRationale: string
  partition: PartitionPolicy | null
  noPartitionRationale?: string
  reconsiderPartitioningWhen?: string
}

function sharedParentUuidv7(parentTable: string) {
  return {
    policy: 'uuidv7' as const,
    rationale: `The id is shared with its UUIDv7 ${parentTable} parent row.`,
  }
}

const COMPANION_ID_POLICIES = [
  [
    'copyright_notice_lifecycle_change_rationales',
    sharedParentUuidv7('copyright_notice_lifecycle_changes'),
  ],
] as const

const RETAINED_ID_POLICIES = [
  ['retained_user_identities', sharedParentUuidv7('users')],
  ['retained_membership_identities', sharedParentUuidv7('memberships')],
  ['retained_api_key_identities', sharedParentUuidv7('api_keys')],
  ['retained_topic_identities', sharedParentUuidv7('topics')],
  ['retained_post_identities', sharedParentUuidv7('posts')],
  ['retained_rss_feed_item_identities', sharedParentUuidv7('rss_feed_items')],
  ['retained_image_identities', sharedParentUuidv7('images')],
  ...entityRelationMetadatum.flatMap(metadata =>
    metadata.election
      ? ([[`retained_${metadata.table_name}`, sharedParentUuidv7(metadata.table_name)]] as const)
      : [],
  ),
] as const

const SHARED_PARENT_ID_POLICIES = [...RETAINED_ID_POLICIES, ...COMPANION_ID_POLICIES] as const

type NonDefaultIdException = { policy: 'uuidv7' | 'natural-or-provider'; rationale: string }
const naturalOrProviderId = (rationale: string): NonDefaultIdException => ({
  policy: 'natural-or-provider',
  rationale,
})
export const NON_DEFAULT_ID_EXCEPTIONS = new Map<string, NonDefaultIdException>([
  ...PROVIDER_LOOKUP_ID_POLICIES,
  ...SHARED_PARENT_ID_POLICIES,
  ['post_publication_post_identities', sharedParentUuidv7('posts')],
  ['post_publication_community_identities', sharedParentUuidv7('communities')],
  ['post_publication_rss_feed_item_identities', sharedParentUuidv7('rss_feed_items')],
  ['post_publication_author_identities', sharedParentUuidv7('users')],
  ['post_publication_rss_feed_identities', sharedParentUuidv7('rss_feeds')],
  ['post_publication_topic_alias_identities', sharedParentUuidv7('topic_aliases')],
  ['post_publication_story_identities', sharedParentUuidv7('stories')],
  ['membership_google_play_recovery_cursors', naturalOrProviderId('Singleton recovery scan.')],
  ['membership_microsoft_store_recovery_cursors', naturalOrProviderId('Singleton recovery scan.')],
  ['bedrock_embedding_batches', naturalOrProviderId('Bedrock owns the batch job identifier.')],
  ['community_agent_prompts', sharedParentUuidv7('agent_prompts')],
  ['rss_feed_items', sharedParentUuidv7('rss_feed_item_guids')],
  ['migrations', naturalOrProviderId('The checked-in migration filename is the key.')],
  ['user_metrics', sharedParentUuidv7('users')],
  [
    'user_sessions',
    { policy: 'uuidv7', rationale: 'The application supplies the UUIDv7 JWT session id.' },
  ],
])
const UNBOUNDED_RECONSIDERATION_EXCEPTIONS = new Map([
  [
    'ai_usage_provider_response_keys',
    'Only if the replacement preserves global response-id uniqueness across every ledger partition.',
  ],
  [
    'web_push_endpoint_owners',
    'Only if the replacement preserves global endpoint uniqueness and claim serialization across every subscription partition.',
  ],
])

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
