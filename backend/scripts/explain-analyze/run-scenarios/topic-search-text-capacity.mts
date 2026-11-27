import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { getTopicIds } from '@services/topics'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { runAndCapture } from '../run-support.mts'

const PAGE_LIMIT = 100
const BACKGROUND_COUNT = 2_000

export async function runTopicTextSearchCapacityScenario(): Promise<void> {
  const scenario = 'topic-search-text-at-cap'
  const queryName = 'buildTopicSearchQuery'
  const scope = uuidv7()
  const search = `topic-search-${scope}`
  const exact = { id: uuidv7(), name: search.toUpperCase(), slug: `exact-${scope}` }
  const prefixes = Array.from({ length: 105 }, (_, index) => ({
    id: uuidv7(),
    name: index % 2 === 0 ? `${search} prefix ${index}` : `Topic prefix ${scope} ${index}`,
    slug: index % 2 === 0 ? `prefix-${scope}-${index}` : `${search}-prefix-${index}`,
  }))
  const substrings = Array.from({ length: 25 }, (_, index) => ({
    id: uuidv7(),
    name: index % 2 === 0 ? `Substring ${search} ${index}` : `Topic substring ${scope} ${index}`,
    slug: index % 2 === 0 ? `substring-${scope}-${index}` : `substring-${search}-${index}`,
  }))
  const deleted = [
    { id: uuidv7(), name: `${search} deleted prefix`, slug: `deleted-prefix-${scope}` },
    { id: uuidv7(), name: `Deleted substring ${search}`, slug: `deleted-substring-${scope}` },
  ]
  const background = Array.from({ length: BACKGROUND_COUNT }, (_, index) => ({
    id: uuidv7(),
    name: `Topic background ${scope} ${index}`,
    slug: `topic-background-${scope}-${index}`,
  }))
  const records = [...prefixes, ...substrings, ...background, exact].map(topic => ({
    ...topic,
    deleted: false,
  }))
  records.push(...deleted.map(topic => ({ ...topic, deleted: true })))
  const ids = records.map(topic => topic.id)
  const prefixIds = prefixes
    .map(topic => topic.id)
    .toSorted()
    .toReversed()
  const substringIds = substrings
    .map(topic => topic.id)
    .toSorted()
    .toReversed()
  const expectedIds = [exact.id, ...prefixIds, ...substringIds]

  try {
    await write(sql`/* seedTopicTextSearchCapacity */
      INSERT INTO topics (id, name, slug, deleted_at, created_via, bedrock_nova_multimodal_v1_content_sha256)
      SELECT id, name, slug, CASE WHEN deleted THEN CURRENT_TIMESTAMP END, 'system',
        decode(repeat('00', 32), 'hex')
      FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
        AS input(id uuid, name text, slug text, deleted boolean)
    `)
    await write('/* analyzeTopicTextSearchCapacity */ ANALYZE topics')

    registerScenarioContract(scenario, {
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        { kind: 'usesIndexes', indexes: ['idx_topics__name_trgm', 'idx_topics__slug_trgm'] },
        { kind: 'noSeqScan', relation: 'topics' },
        { kind: 'maxProcessedRows', relation: 'topics', max: 160 },
        { kind: 'maxBitmapIndexRows', max: 160 },
      ],
      seededRows: { topics: (SEEDED_ROWS_BY_RELATION.topics ?? 0) + records.length },
    })

    await runAndCapture(
      scenario,
      async () => {
        const options = { text_search_query: search, limit: PAGE_LIMIT }
        const first = await getTopicIds(options)
        assert.deepEqual(
          first.results.map(topic => topic.id),
          expectedIds.slice(0, PAGE_LIMIT),
        )
        const after = first.page_info.end_cursor
        assert.ok(after)
        assert.deepEqual(first.page_info, {
          has_next_page: true,
          start_cursor: encodeCursor({ tier: 0, id: exact.id }),
          end_cursor: encodeCursor({ tier: 1, id: expectedIds[PAGE_LIMIT - 1]! }),
        })

        const next = await getTopicIds({ ...options, after })
        assert.deepEqual(
          next.results.map(topic => topic.id),
          expectedIds.slice(PAGE_LIMIT),
        )
        assert.deepEqual(next.page_info, {
          has_next_page: false,
          start_cursor: encodeCursor({ tier: 1, id: expectedIds[PAGE_LIMIT]! }),
          end_cursor: null,
        })
      },
      undefined,
      queryName,
      { exactCapturedNames: [queryName, queryName] },
    )
  } finally {
    await using transaction = await beginTransaction()
    await transaction(sql`/* cleanupTopicTextSearchCapacity */
      DELETE FROM topics WHERE id = ANY(${ids}::uuid[])
    `)
    await transaction(sql`/* cleanupTopicTextSearchCapacityIdentities */
      DELETE FROM retained_topic_identities WHERE id = ANY(${ids}::uuid[])
    `)
    await transaction.commit()
    await write('/* analyzeAfterTopicTextSearchCapacity */ ANALYZE topics')
  }
}
