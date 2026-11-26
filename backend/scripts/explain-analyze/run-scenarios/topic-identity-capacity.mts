import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { getAdditionalHostnames } from '@services/topics/additional-hostnames'
import { getTopicAliasRecords } from '@services/topics/get-topic-aliases'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const PAGE_LIMIT = 100
const TARGET_ROWS = 121
const TOPIC_COUNT = 24

type TopicIdentityFixture = {
  topics: string[]
  records: { id: string; topic_id: string; label: string }[]
  targetRecords: { id: string; label: string }[]
}

function topicIdentityFixture(start: number, kind: 'alias' | 'host'): TopicIdentityFixture {
  const topics = Array.from({ length: TOPIC_COUNT }, (_, index) => seedUuid(start + index, '04'))
  const records = Array.from({ length: TARGET_ROWS * TOPIC_COUNT }, (_, index) => ({
    id: seedUuid(start + index, kind === 'alias' ? 'e3' : '02'),
    topic_id: topics[index % TOPIC_COUNT]!,
    label: `capacity-${kind}-${index.toString().padStart(5, '0')}`,
  }))
  return { topics, records, targetRecords: records.filter(row => row.topic_id === topics[0]) }
}

async function insertFixtureTopics(topics: string[]): Promise<void> {
  await write(sql`/* seedTopicIdentityCapacityTopics */
    INSERT INTO topics (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
    SELECT id, 'Topic identity capacity ' || id, 'topic-identity-capacity-' || id, 'system',
      decode(repeat('00', 32), 'hex')
    FROM unnest(${topics}::uuid[]) AS input(id)
  `)
}

export async function runTopicAliasCapacityScenario(): Promise<void> {
  const scenario = 'topic-alias-records-at-cap'
  const queryName = 'getTopicAliasRecords'
  const { topics, records, targetRecords } = topicIdentityFixture(7_000_000, 'alias')
  const aliasIds = records.map(row => row.id)
  const topicId = topics[0]!
  const cleanup = async () => {
    await using transaction = await beginTransaction()
    await transaction(sql`/* cleanupTopicAliasCapacityAliases */
      DELETE FROM topic_aliases WHERE id = ANY(${aliasIds}::uuid[])
    `)
    await transaction(sql`/* cleanupTopicAliasCapacityReconciliation */
      DELETE FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = ANY(${aliasIds}::uuid[])
    `)
    await transaction(sql`/* cleanupTopicAliasCapacityTopics */
      DELETE FROM topics WHERE id = ANY(${topics}::uuid[])
    `)
    await transaction.commit()
  }
  await cleanup()
  try {
    await insertFixtureTopics(topics)
    await write(sql`/* seedTopicAliasCapacity */
      INSERT INTO topic_aliases (id, topic_id, alias)
      SELECT id, topic_id, label
      FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
        AS alias(id uuid, topic_id uuid, label text)
    `)
    await write('/* analyzeTopicAliasCapacity */ ANALYZE topic_aliases')
    registerScenarioContract(scenario, {
      expectations: [],
      seededRows: { topic_aliases: (SEEDED_ROWS_BY_RELATION.topic_aliases ?? 0) + records.length },
    })
    await runAndCapture(
      scenario,
      async () => {
        const first = await getTopicAliasRecords(topicId, { limit: PAGE_LIMIT })
        assert.deepEqual(
          first.results.map(row => row.id),
          targetRecords.slice(0, PAGE_LIMIT).map(row => row.id),
        )
        assert.equal(first.hasNextPage, true)
        const after = first.results.at(-1)!.alias
        assert.equal(after, targetRecords[PAGE_LIMIT - 1]!.label)
        const next = await getTopicAliasRecords(topicId, { limit: PAGE_LIMIT, after })
        assert.deepEqual(
          next.results.map(row => row.id),
          targetRecords.slice(PAGE_LIMIT).map(row => row.id),
        )
        assert.equal(next.hasNextPage, false)
      },
      undefined,
      queryName,
      { exactCapturedNames: [queryName, queryName] },
    )
  } finally {
    await cleanup()
    await write('/* analyzeAfterTopicAliasCapacity */ ANALYZE topic_aliases')
  }
}

export async function runTopicHostnameCapacityScenario(): Promise<void> {
  const scenario = 'topic-additional-hostnames-at-cap'
  const queryName = 'getAdditionalHostnames'
  const { topics, records, targetRecords } = topicIdentityFixture(7_010_000, 'host')
  const [primary, ...additional] = targetRecords
  const topicId = topics[0]!
  const hostnameIds = records.map(row => row.id)
  const cleanup = async () => {
    await using transaction = await beginTransaction()
    await transaction(sql`/* cleanupTopicHostnameCapacityPrimary */
      UPDATE topics SET hostname_id = NULL WHERE id = ${topicId} AND hostname_id = ${primary!.id}
    `)
    await transaction(sql`/* cleanupTopicHostnameCapacityHostnames */
      DELETE FROM url_hostnames WHERE id = ANY(${hostnameIds}::uuid[])
    `)
    await transaction(sql`/* cleanupTopicHostnameCapacityTopics */
      DELETE FROM topics WHERE id = ANY(${topics}::uuid[])
    `)
    await transaction.commit()
  }
  await cleanup()
  try {
    await insertFixtureTopics(topics)
    await write(sql`/* seedTopicHostnameCapacity */
      INSERT INTO url_hostnames (id, topic_id, hostname)
      SELECT id, topic_id, label || '.example.com'
      FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
        AS hostname(id uuid, topic_id uuid, label text)
    `)
    await write(sql`/* seedTopicHostnameCapacityPrimary */
      UPDATE topics SET hostname_id = ${primary!.id} WHERE id = ${topicId}
    `)
    await write('/* analyzeTopicHostnameCapacity */ ANALYZE topics, url_hostnames')
    registerScenarioContract(scenario, {
      expectations: [],
      seededRows: { url_hostnames: (SEEDED_ROWS_BY_RELATION.url_hostnames ?? 0) + records.length },
    })
    await runAndCapture(
      scenario,
      async () => {
        const first = await getAdditionalHostnames(topicId, { limit: PAGE_LIMIT })
        assert.deepEqual(
          first.results.map(row => row.hostname_id),
          additional.slice(0, PAGE_LIMIT).map(row => row.id),
        )
        assert.equal(first.hasNextPage, true)
        const after = first.results.at(-1)!.hostname_id
        assert.equal(after, additional[PAGE_LIMIT - 1]!.id)
        const next = await getAdditionalHostnames(topicId, {
          limit: PAGE_LIMIT,
          after: { id: after },
        })
        assert.deepEqual(
          next.results.map(row => row.hostname_id),
          additional.slice(PAGE_LIMIT).map(row => row.id),
        )
        assert.equal(next.hasNextPage, false)
      },
      undefined,
      queryName,
      { exactCapturedNames: [queryName, queryName] },
    )
  } finally {
    await cleanup()
    await write('/* analyzeAfterTopicHostnameCapacity */ ANALYZE topics, url_hostnames')
  }
}
