import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { snapshotTopicMergeAliases } from '@services/topics/merge-aliases-snapshot'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runTopicMergeAliasSnapshotCapacity(
  operationId: string,
  source: { id: string; slug: string },
  destinationId: string,
  linked: readonly { id: string; alias: string }[],
  limit: number,
): Promise<void> {
  const scenario = 'topic-merge-alias-snapshot-tail-at-cap'
  const firstCursor = linked[limit - 1]!.alias
  assert.ok(linked[limit]!.alias < source.slug)
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: limit, captureIndex: 0 },
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 1, captureIndex: 1 },
      { kind: 'custom', name: 'topicMergeAliasCursorSeek' },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      const first = await snapshotTopicMergeAliases(
        query,
        operationId,
        source.id,
        destinationId,
        source.slug,
        1,
        null,
        limit,
      )
      assert.deepEqual(first, { cursorAlias: firstCursor, done: false })
      const tail = await snapshotTopicMergeAliases(
        query,
        operationId,
        source.id,
        destinationId,
        source.slug,
        1,
        firstCursor,
        limit,
      )
      assert.deepEqual(tail, { cursorAlias: source.slug, done: true })
      const { rows } = await query<{ id: string | null; alias: string }>(
        sql`/* readExplainMergeAliasSnapshot */
          SELECT alias.id, saved.alias
          FROM topic_merge_operations operation
          CROSS JOIN LATERAL jsonb_array_elements_text(operation.source_aliases_before)
            WITH ORDINALITY AS saved(alias, position)
          LEFT JOIN topic_aliases alias ON alias.topic_id = ${source.id} AND alias.alias = saved.alias
          WHERE operation.id = ${operationId}
          ORDER BY saved.position`,
      )
      assert.deepEqual(rows, [
        ...linked.map(({ id, alias }) => ({ id, alias })),
        { id: null, alias: source.slug },
      ])
      await query.rollback()
    },
    undefined,
    'snapshotTopicMergeAliases',
  )
}
