import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { describe, expect, it } from 'vitest'
import {
  buildUnboundedUnpartitionedTables,
  EXPLICIT_BOUNDED_TABLES,
  NON_DEFAULT_ID_EXCEPTIONS,
  STATIC_IDENTITY_EXCEPTIONS,
} from './schema-growth-classification.mts'
import {
  buildSchemaGrowthRegistry,
  PARTITION_POLICIES,
  UNBOUNDED_UNPARTITIONED_TABLES,
  type SchemaIdPolicy,
} from './schema-growth-registry.mts'
import { EXTRA_UNBOUNDED_TABLES } from './schema-growth-unbounded-extra.mts'

const uuidv7Identity = {
  idPolicy: 'uuidv7' as SchemaIdPolicy,
  idPolicyRationale: 'UUIDv7 test identity.',
}

describe('schema growth classification', () => {
  it('builds each explicit unpartitioned rationale class', () => {
    const tables = buildUnboundedUnpartitionedTables(new Set())

    expect(tables.get('communities')).toContain('product adoption')
    expect(tables.get('rss_feed_item_ids')).toContain('Relationship edges')
    expect(tables.get('admin_import_batches')).toContain('audit/workflow')
    expect(tables.get('ai_usage_openai_response_keys')).toContain('global response-id idempotency')
    expect(tables.get('notification_push_intents')).toContain('Pending delivery work')
    expect(tables.get('notification_push_intent_subscription_receipts')).toContain(
      'Generation receipts',
    )
    expect(tables.get('web_push_endpoint_owners')).toContain('cross-user endpoint uniqueness')
    expect(tables.get('community_members')).toContain('Relationship edges')
    expect(tables.get(EXTRA_UNBOUNDED_TABLES[0]!)).toContain('owning entity or workflow')
    expect(tables.get('relation__user__category__topic')).toContain('Config-generated')
    expect(tables.get('support_agent_runs')).toContain('Support automation')
    expect(tables.get('support_messages')).toContain('Support correspondence')
  })

  it('omits config-generated relations that are already partitioned', () => {
    const relationTables = new Set(entityRelationMetadatum.map(({ table_name }) => table_name))
    const tables = buildUnboundedUnpartitionedTables(relationTables)

    expect([...relationTables].filter(table => tables.has(table))).toEqual([])
  })

  it('publishes the bounded and non-default identity exceptions', () => {
    expect(STATIC_IDENTITY_EXCEPTIONS.get('countries')).toContain('ISO country')
    expect(EXPLICIT_BOUNDED_TABLES.get('migrations')).toContain('checked-in migration')
    expect(EXPLICIT_BOUNDED_TABLES.get('post_category_finalizations')).toContain('per post')
    expect(EXPLICIT_BOUNDED_TABLES.has('notification_push_intents')).toBe(false)
    expect(EXPLICIT_BOUNDED_TABLES.has('notification_push_intent_subscription_receipts')).toBe(
      false,
    )
    expect(NON_DEFAULT_ID_EXCEPTIONS.get('user_sessions')).toMatchObject({ policy: 'uuidv7' })
  })
})

describe('schema growth registry', () => {
  it('sorts and describes partitioned, unpartitioned, and bounded tables', () => {
    const registry = buildSchemaGrowthRegistry(
      new Map([
        ['posts', uuidv7Identity],
        ['communities', uuidv7Identity],
        ['countries', { idPolicy: 'static-identity' as const, idPolicyRationale: 'ISO key.' }],
      ]),
    )

    expect(registry.map(({ table }) => table)).toEqual(['communities', 'countries', 'posts'])
    expect(registry[0]).toMatchObject({
      growth: 'unbounded',
      partition: null,
      reconsiderPartitioningWhen: expect.stringContaining('one million'),
    })
    expect(registry[1]).toMatchObject({
      growth: 'bounded',
      partition: null,
      reconsiderPartitioningWhen: expect.stringContaining('bounded-cardinality'),
    })
    expect(registry[2]).toMatchObject({
      growth: 'unbounded',
      partition: PARTITION_POLICIES.get('posts'),
    })
    expect(registry[2]).not.toHaveProperty('noPartitionRationale')
  })

  it('keeps transient high-fanout work bounded even when target-partitioned', () => {
    const [entry] = buildSchemaGrowthRegistry(
      new Map([['post_publication_dirty_work_keys', uuidv7Identity]]),
    )

    expect(entry).toMatchObject({
      growth: 'bounded',
      partition: PARTITION_POLICIES.get('post_publication_dirty_work_keys'),
    })
    expect(entry).not.toHaveProperty('noPartitionRationale')
  })

  it('keeps global response-id uniqueness as the partitioning gate for usage keys', () => {
    const [entry] = buildSchemaGrowthRegistry(
      new Map([
        [
          'ai_usage_openai_response_keys',
          { idPolicy: 'no-id' as const, idPolicyRationale: 'Natural response-id key.' },
        ],
      ]),
    )

    expect(entry).toMatchObject({
      growth: 'unbounded',
      partition: null,
      reconsiderPartitioningWhen: expect.stringContaining('global response-id uniqueness'),
    })
  })

  it('keeps global endpoint uniqueness as the partitioning gate for push ownership', () => {
    const [entry] = buildSchemaGrowthRegistry(
      new Map([
        [
          'web_push_endpoint_owners',
          { idPolicy: 'no-id' as const, idPolicyRationale: 'Endpoint digest key.' },
        ],
      ]),
    )

    expect(entry).toMatchObject({
      growth: 'unbounded',
      partition: null,
      noPartitionRationale: expect.stringContaining('cross-user endpoint uniqueness'),
      reconsiderPartitioningWhen: expect.stringContaining('global endpoint uniqueness'),
    })
  })

  it('rejects tables without an explicit growth classification', () => {
    expect(() =>
      buildSchemaGrowthRegistry(new Map([['unclassified_test_table', uuidv7Identity]])),
    ).toThrow('Unclassified schema growth table: unclassified_test_table')
  })

  it('keeps the exported unpartitioned registry populated', () => {
    expect(UNBOUNDED_UNPARTITIONED_TABLES.size).toBeGreaterThan(EXTRA_UNBOUNDED_TABLES.length)
    expect(PARTITION_POLICIES.get('crawls')).toMatchObject({
      strategy: 'RANGE',
      children: 'monthly',
      retentionOwner: 'cleanupPartitions',
      accessClass: 'retention-window',
    })
    expect(PARTITION_POLICIES.get('rss_feed_crawls')).toMatchObject({
      strategy: 'RANGE',
      key: 'id',
      children: 'monthly',
      retentionOwner: 'cleanupPartitions',
      accessClass: 'retention-window',
    })
    expect(PARTITION_POLICIES.get('entity_relation_votes')).toMatchObject({
      strategy: 'LIST -> RANGE',
      accessClass: 'intentional-fanout',
    })
    expect(PARTITION_POLICIES.get('topic_classifier_results')).toMatchObject({
      strategy: 'RANGE',
      key: 'topic_id',
      children: 'default',
    })
    expect(PARTITION_POLICIES.get('story_classifier_results')).toMatchObject({
      strategy: 'RANGE',
      key: 'story_id',
      children: 'default',
    })
    expect(UNBOUNDED_UNPARTITIONED_TABLES.has('classifier_candidate_thresholds')).toBe(true)
  })

  it('classifies RSS feed item identity and content storage separately', () => {
    expect(PARTITION_POLICIES.get('rss_feed_items')).toMatchObject({
      strategy: 'RANGE',
      key: 'id',
      children: 'default',
    })
    expect(UNBOUNDED_UNPARTITIONED_TABLES.get('rss_feed_item_ids')).toContain('Relationship edges')
    expect(UNBOUNDED_UNPARTITIONED_TABLES.has('rss_feed_items')).toBe(false)
    expect(NON_DEFAULT_ID_EXCEPTIONS.get('rss_feed_items')).toMatchObject({ policy: 'uuidv7' })
  })
})
