import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getTopicsByReferenceBatch } from '@services/topics/resolve-references'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

type FixtureTopic = {
  id: string
  slug: string
  name: string
}

export async function runTopicReferenceCapacityScenario(): Promise<void> {
  const limit = 500 // Topic import default and ceiling in services/user-import-export/config.mts.
  const cohort = `topic-resolver-${randomUUID()}`
  const ownedPattern = `${cohort}-%`
  try {
    await captureTopicReferences(cohort, limit)
  } finally {
    const { rows } = await write<{ id: string }>(sql`/* cleanupExplainTopicReferenceAliases */
      DELETE FROM topic_aliases WHERE alias LIKE ${ownedPattern} RETURNING id`)
    await write(sql`/* cleanupExplainTopicReferenceReconciliations */
      DELETE FROM topic_alias_category_mapping_reconciliations WHERE topic_alias_id = ANY(${rows.map(row => row.id)}::uuid[])`)
    await write(sql`/* cleanupExplainTopicReferenceCatalog */
      DELETE FROM topics WHERE slug LIKE ${ownedPattern}`)
  }
}

async function captureTopicReferences(cohort: string, limit: number): Promise<void> {
  const background = 12_000
  const { rows: topics } = await write<FixtureTopic>(sql`/* seedExplainTopicReferenceCatalog */
    INSERT INTO topics (name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
    SELECT ${cohort} || ' catalog ' || entry.n, ${cohort} || '-slug-' || entry.n,
      'system', decode(repeat('00', 32), 'hex')
    FROM generate_series(0, ${background + limit - 1}::int) entry(n)
    RETURNING id, name, slug`)
  const bySlug = new Map(topics.map(topic => [topic.slug, topic]))
  const topicsForInputs = Array.from({ length: limit }, (_, index) =>
    bySlug.get(`${cohort}-slug-${index}`)!,
  )
  assert.ok(topicsForInputs.every(Boolean))
  const targetIds = new Set(topicsForInputs.map(topic => topic.id))
  const backgroundIds = topics.filter(topic => !targetIds.has(topic.id)).map(topic => topic.id)
  const merges = topicsForInputs.flatMap((topic, index) =>
    index % 5 === 3 ? [{ source: `${cohort}-merged-${index}`, destination: topic.id }] : [],
  )
  await write(sql`/* seedExplainTopicReferenceAliases */
    INSERT INTO topic_aliases (alias, topic_id)
    SELECT ${cohort} || '-alias-' || (entry.ordinal - 1), entry.topic_id
    FROM unnest(${topicsForInputs.map(topic => topic.id)}::uuid[]) WITH ORDINALITY AS entry(topic_id, ordinal)
    WHERE (entry.ordinal - 1) % 5 = 2
    UNION ALL
    SELECT topic.slug || '-old', topic.id FROM topics topic
    WHERE topic.id = ANY(${backgroundIds}::uuid[])`)
  await write(sql`/* seedExplainMergedTopicReferences */
    INSERT INTO topics (name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256,
      merged_into_topic_id, merged_at, merged_by_id)
    SELECT entry.source, entry.source, 'system', decode(repeat('00', 32), 'hex'),
      entry.destination, CURRENT_TIMESTAMP, ${seedUser.id}
    FROM jsonb_to_recordset(${JSON.stringify(merges)}::jsonb) AS entry(source text, destination uuid)`)
  await write('/* analyzeExplainTopicReferenceCatalog */ ANALYZE topics, topic_aliases')

  const cases = topicsForInputs.map((topic, index): { reference: string; id: string | null } => {
    switch (index % 5) {
      case 0:
        return { reference: topic.slug, id: topic.id }
      case 1:
        return { reference: topic.name.toUpperCase(), id: topic.id }
      case 2:
        return { reference: `${cohort}-alias-${index}`, id: topic.id }
      case 3:
        return { reference: `${cohort}-merged-${index}`, id: topic.id }
      default:
        return { reference: `${cohort}-missing-${index}`, id: null }
    }
  })
  const {
    rows: [corpus],
  } = await write<{ topics: number; aliases: number }>(sql`
    /* countExplainTopicReferenceCorpus */
    SELECT (SELECT count(*)::int FROM topics) AS topics,
      (SELECT count(*)::int FROM topic_aliases) AS aliases`)
  assert.ok(corpus)
  const scenario = 'topic-import-reference-resolution-at-cap'
  registerScenarioContract(scenario, {
    seededRows: { topics: corpus.topics, topic_aliases: corpus.aliases },
    expectations: [
      // Main custom scans topics twice and aliases once. https://github.com/vouchington/vouchington/issues/6551
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 * corpus.topics + 2 * limit },
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: corpus.aliases },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const results = await getTopicsByReferenceBatch(cases.map(entry => entry.reference))
      assert.deepEqual(
        results.map(topic => topic?.id ?? null),
        cases.map(entry => entry.id),
      )
    },
    undefined,
    'getTopicsByReferenceBatch',
  )
}
