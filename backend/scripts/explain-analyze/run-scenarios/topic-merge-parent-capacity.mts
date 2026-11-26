import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { processTopicMergeParentPreflightPage } from '@services/topics/merge-parent-pages'
import { getTopicMergeWorkLimit } from '@services/topics/merge-work-limits'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

export async function runTopicMergeParentCapacityScenario(): Promise<void> {
  const limit = getTopicMergeWorkLimit('page_size')
  const cohort = `explain-topic-parents-${randomUUID()}`
  const { rows } = await write<{ id: string }>(sql`/* seedExplainTopicMergeParentTopics */
    INSERT INTO topics (name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
    SELECT ${cohort} || '-' || entry.n, ${cohort} || '-' || entry.n, 'system',
      decode(repeat('00', 32), 'hex')
    FROM generate_series(0, ${limit + 152}::int) entry(n)
    RETURNING id`)
  const topicIds = rows.map(row => row.id).toSorted()
  const [sourceId, destinationId] = topicIds
  assert.ok(sourceId && destinationId)
  const parents = topicIds.slice(2, limit + 3)
  const otherSubjects = topicIds.slice(limit + 3, limit + 103)
  const otherParents = topicIds.slice(limit + 103)
  const active = [parents[limit - 1]!, parents[limit]!]
  let operationId: string | undefined
  try {
    await write(sql`/* seedExplainTopicMergeParentEdges */
      INSERT INTO relation__topic__parent__topic (subject_id, object_id, deleted_at)
      SELECT ${sourceId}::uuid, parent.id,
        CASE WHEN parent.ordinal < ${limit} THEN CURRENT_TIMESTAMP END
      FROM unnest(${parents}::uuid[]) WITH ORDINALITY AS parent(id, ordinal)
      UNION ALL
      SELECT subject.id, parent.id, NULL::timestamptz
      FROM unnest(${otherSubjects}::uuid[]) AS subject(id)
      CROSS JOIN unnest(${otherParents}::uuid[]) AS parent(id)`)
    const {
      rows: [operation],
    } = await write<{ id: string }>(sql`/* seedExplainTopicMergeParentOperation */
      INSERT INTO topic_merge_operations (source_topic_id, destination_topic_id, requested_by_id)
      VALUES (${sourceId}, ${destinationId}, ${seedUser.id}) RETURNING id`)
    assert.ok(operation)
    operationId = operation.id
    await write('/* analyzeExplainTopicMergeParents */ ANALYZE relation__topic__parent__topic')
    const scenario = 'topic-merge-parent-preflight-at-cap'
    registerScenarioContract(scenario, {
      expectations: [
        // The generic continuation can revisit the prefix. https://github.com/vouchington/vouchington/issues/6601
        {
          kind: 'maxProcessedRows',
          relation: 'relation__topic__parent__topic',
          max: limit + 1,
          captureIndex: 0,
        },
        {
          kind: 'maxProcessedRows',
          relation: 'relation__topic__parent__topic',
          max: limit + 1,
          captureIndex: 1,
        },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        await using query = await beginTransaction()
        const readWork = async () => {
          const { rows: items } = await query<{
            topic_id: string
            depth: number
            cursor_object_id: string | null
            completed: boolean
          }>(sql`/* readExplainTopicMergeParentWork */
            SELECT topic_id, depth, cursor_object_id, completed_at IS NOT NULL AS completed
            FROM topic_merge_parent_ancestors WHERE operation_id = ${operation.id}
            ORDER BY topic_id`)
          return items.map(item => [
            item.topic_id,
            item.depth,
            item.cursor_object_id,
            item.completed,
          ])
        }
        const first = await processTopicMergeParentPreflightPage(
          query,
          operation.id,
          sourceId,
          destinationId,
          limit,
        )
        assert.deepEqual(first, { hasMore: true, errorCode: null })
        assert.deepEqual(await readWork(), [
          [sourceId, 0, active[0], false],
          [destinationId, 0, null, false],
          [active[0], 1, null, false],
        ])
        const last = await processTopicMergeParentPreflightPage(
          query,
          operation.id,
          sourceId,
          destinationId,
          limit,
        )
        assert.deepEqual(last, { hasMore: true, errorCode: null })
        assert.deepEqual(await readWork(), [
          [sourceId, 0, active[1], true],
          [destinationId, 0, null, false],
          [active[0], 1, null, false],
          [active[1], 1, null, false],
        ])
        await query.rollback()
      },
      undefined,
      'pageTopicMergeParentEdges',
    )
  } finally {
    if (operationId) {
      await write(sql`/* cleanupExplainTopicMergeParentOperation */
        DELETE FROM topic_merge_operations WHERE id = ${operationId}`)
    }
    await write(sql`/* cleanupExplainTopicMergeParentTopics */
      DELETE FROM topics WHERE id = ANY(${topicIds}::uuid[])`)
  }
}
