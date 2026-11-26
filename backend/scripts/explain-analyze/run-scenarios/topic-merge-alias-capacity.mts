import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { processTopicMergeAliasPage } from '@services/topics/merge-aliases-page'
import { processTopicMergeOperationPage } from '@services/topics/merge-operation-page'
import { getTopicMergeWorkLimit } from '@services/topics/merge-work-limits'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

type Alias = { id: string; alias: string; topic_id: string | null; unlink_topic_id: string | null }

export async function runTopicMergeAliasCapacityScenarios(): Promise<void> {
  const cohort = `explain-merge-alias-${randomUUID()}`
  const limit = getTopicMergeWorkLimit('page_size')
  const {
    rows: [source, destination, background],
  } = await write<{ id: string; slug: string }>(sql`/* seedExplainTopicMergeAliasTopics */
    INSERT INTO topics (name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
    SELECT ${cohort} || '-' || entry.kind, ${cohort} || '-' || entry.kind, 'system',
      decode(repeat('00', 32), 'hex')
    FROM unnest(ARRAY['source', 'destination', 'background']) WITH ORDINALITY AS entry(kind, ordinal)
    ORDER BY entry.ordinal RETURNING id, slug`)
  assert.ok(source && destination && background)
  const topicIds = [source.id, destination.id, background.id]
  let operationId: string | undefined
  try {
    const { rows } = await write<Alias>(sql`/* seedExplainTopicMergeAliases */
      INSERT INTO topic_aliases (alias, topic_id, unlink_topic_id, unlink_requested_at)
      SELECT ${cohort} || '-linked-' || lpad(position.n::text, 6, '0'),
        CASE WHEN position.n % 80 = 0 THEN ${source.id}::uuid ELSE ${background.id}::uuid END,
        NULL::uuid, NULL::timestamptz
      FROM generate_series(0, ${limit * 80}::int) position(n)
      UNION ALL
      SELECT ${cohort} || '-pending-' || lpad(position.n::text, 6, '0'), NULL::uuid,
        ${source.id}::uuid, CURRENT_TIMESTAMP
      FROM generate_series(0, ${limit}::int) position(n)
      RETURNING id, alias, topic_id, unlink_topic_id`)
    const linked = rows.filter(row => row.topic_id === source.id).toSorted(byAlias)
    const pending = rows.filter(row => row.unlink_topic_id === source.id).toSorted(byId)
    const unrelated = rows.filter(row => row.topic_id === background.id).map(row => row.id)
    assert.equal(linked.length, limit + 1)
    assert.equal(pending.length, limit + 1)
    const {
      rows: [operation],
    } = await write<{
      id: string
      generation: number
    }>(sql`/* seedExplainTopicMergeAliasOperation */
      INSERT INTO topic_merge_operations (source_topic_id, destination_topic_id, requested_by_id, stage, alias_phase)
      VALUES (${source.id}, ${destination.id}, ${seedUser.id}, 'aliases', 2)
      RETURNING id, generation`)
    assert.ok(operation)
    operationId = operation.id
    await write('/* analyzeExplainTopicMergeAliases */ ANALYZE topic_aliases')
    const settings = { 'voucha.topic_merge_operation_id': operation.id }
    const runPage = (query: TransactionQuery, cursor: string | null) =>
      processTopicMergeAliasPage(
        query,
        operation.id,
        source.id,
        destination.id,
        seedUser.id,
        source.slug,
        2,
        cursor,
        limit,
      )

    const assertPageChanges = async (query: TransactionQuery, moved: number) => {
      const { rows: after } = await query<Alias>(sql`/* readExplainTopicMergeAliasState */
        SELECT id, alias, topic_id, unlink_topic_id FROM topic_aliases
        WHERE id = ANY(${rows.map(row => row.id)}::uuid[])`)
      const liveIds = new Set(linked.slice(0, moved).map(row => row.id))
      const pendingIds = new Set(pending.slice(0, moved).map(row => row.id))
      assert.deepEqual(
        new Set(after.filter(row => row.topic_id === destination.id).map(row => row.id)),
        liveIds,
      )
      assert.deepEqual(
        new Set(after.filter(row => row.unlink_topic_id === destination.id).map(row => row.id)),
        pendingIds,
      )
      assert.deepEqual(
        new Set(after.filter(row => row.topic_id === source.id).map(row => row.id)),
        new Set(linked.slice(moved).map(row => row.id)),
      )
      assert.deepEqual(
        new Set(after.filter(row => row.unlink_topic_id === source.id).map(row => row.id)),
        new Set(pending.slice(moved).map(row => row.id)),
      )
      assert.deepEqual(
        new Set(after.filter(row => row.topic_id === background.id).map(row => row.id)),
        new Set(unrelated),
      )
      const { rows: retained } = await query<{
        alias_id: string
      }>(sql`/* readExplainTopicMergeRetainedAliases */
        SELECT alias_id FROM topic_merge_operation_aliases WHERE operation_id = ${operation.id}`)
      assert.deepEqual(new Set(retained.map(row => row.alias_id)), liveIds)
    }

    const captureFirstPage = async () => {
      await using query = await beginTransaction()
      await query(sql`/* setExplainTopicMergeAliasOperation */
        SELECT set_config('voucha.topic_merge_operation_id', ${operation.id}, true)`)
      const first = await runPage(query, null)
      assert.deepEqual(first, { phase: 2, cursorAlias: linked[limit - 1]!.alias, hasMore: true })
      await assertPageChanges(query, limit)
      await query.rollback()
    }
    registerScenarioContract('topic-merge-alias-move-at-cap', {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'topic_aliases', max: limit + 1, captureIndex: 0 },
        { kind: 'maxProcessedRows', relation: 'topic_aliases', max: limit, captureIndex: 1 },
      ],
    })
    await runAndCapture(
      'topic-merge-alias-move-at-cap',
      captureFirstPage,
      undefined,
      ['processTopicMergeAliasPage', 'processTopicMergeAliasPage move'],
      { localSettings: settings },
    )
    registerScenarioContract('topic-merge-alias-repoint-unlinks-at-cap', {
      expectations: [{ kind: 'maxProcessedRows', relation: 'topic_aliases', max: limit * 3 }],
    })
    await runAndCapture(
      'topic-merge-alias-repoint-unlinks-at-cap',
      captureFirstPage,
      undefined,
      'processTopicMergeAliasPage repointPendingUnlinks',
      { localSettings: settings },
    )

    // The worker commits the moves and cursor together before the continuation runs.
    assert.equal(
      await processTopicMergeOperationPage(operation.id, operation.generation),
      operation.generation + 1,
    )
    const {
      rows: [checkpoint],
    } = await write<{
      alias_phase: number
      cursor_alias: string
    }>(sql`/* readExplainTopicMergeAliasCheckpoint */
      SELECT alias_phase, cursor_alias FROM topic_merge_operations WHERE id = ${operation.id}`)
    const cursorAlias = linked[limit - 1]!.alias
    assert.deepEqual(checkpoint, { alias_phase: 2, cursor_alias: cursorAlias })
    await assert.rejects(
      () =>
        write(sql`/* attemptExplainTopicMergeAliasReattach */
          UPDATE topic_aliases SET topic_id = ${source.id} WHERE id = ${linked[0]!.id}`),
      { code: 'topic_merge_in_progress' },
    )
    const tailScenario = 'topic-merge-alias-move-tail-at-cap'
    registerScenarioContract(tailScenario, {
      allowEmptyResult: true,
      expectations: [{ kind: 'maxProcessedRows', relation: 'topic_aliases', max: 1 }],
    })
    await runAndCapture(
      tailScenario,
      async () => {
        await using query = await beginTransaction()
        await assertPageChanges(query, limit)
        await query(sql`/* setExplainTopicMergeAliasOperation */
          SELECT set_config('voucha.topic_merge_operation_id', ${operation.id}, true)`)
        const last = await runPage(query, cursorAlias)
        assert.deepEqual(last, { phase: 2, cursorAlias: linked.at(-1)!.alias, hasMore: false })
        await assertPageChanges(query, limit + 1)
        await query.rollback()
      },
      undefined,
      ['processTopicMergeAliasPage', 'processTopicMergeAliasPage move'],
      { localSettings: settings },
    )
  } finally {
    if (operationId) {
      await write(sql`/* cleanupExplainTopicMergeAliasOperation */
        DELETE FROM topic_merge_operations WHERE id = ${operationId}`)
    }
    const { rows: deleted } = await write<{ id: string }>(sql`/* cleanupExplainTopicMergeAliases */
      DELETE FROM topic_aliases WHERE alias LIKE ${`${cohort}-%`} RETURNING id`)
    await write(sql`/* cleanupExplainTopicMergeAliasReconciliations */
      DELETE FROM topic_alias_category_mapping_reconciliations WHERE topic_alias_id = ANY(${deleted.map(row => row.id)}::uuid[])`)
    await write(sql`/* cleanupExplainTopicMergeAliasTopics */
      DELETE FROM topics WHERE id = ANY(${topicIds}::uuid[])`)
  }
}

function byAlias(a: Alias, b: Alias): number {
  return a.alias < b.alias ? -1 : Number(a.alias > b.alias)
}

function byId(a: Alias, b: Alias): number {
  return a.id < b.id ? -1 : Number(a.id > b.id)
}
