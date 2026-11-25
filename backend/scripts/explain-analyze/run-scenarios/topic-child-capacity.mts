import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { decodeScopedUuidCursor } from '@modules/pagination'
import { getTopicChildrenPage, topicChildrenPaginationParser } from '@services/topics/children-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const scenario = 'topic-children-at-cap'
const parentId = seedUuid(2450, '04')
const children = Array.from({ length: 101 }, (_, index) => seedUuid(1300 + index, '04'))
const hiddenChildId = seedUuid(1299, '04')

export async function runTopicChildCapacityScenario(): Promise<void> {
  const ids = [hiddenChildId, ...children]
  await write(
    `/* seedTopicChildrenCapacity */ INSERT INTO relation__topic__parent__topic
      (subject_id, object_id, created_by_id, deleted_at, deleted_by_id)
    SELECT id, $2, $3,
      CASE WHEN id = $4 THEN CURRENT_TIMESTAMP END, CASE WHEN id = $4 THEN $3::uuid END
    FROM unnest($1::uuid[]) AS fixture(id)`,
    [ids, parentId, seedUser.id, hiddenChildId],
  )
  try {
    await write('/* analyzeTopicChildrenCapacity */ ANALYZE relation__topic__parent__topic')
    registerScenarioContract(scenario, {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_relation__topic__parent__topic__reverse_index'],
        },
        { kind: 'maxProcessedRows', relation: 'relation__topic__parent__topic', max: ids.length },
      ],
    })
    const scope = `topic-children:${parentId}:id-asc`
    await runAndCapture(
      scenario,
      async () => {
        const page = await getTopicChildrenPage(
          parentId,
          topicChildrenPaginationParser.parse({ limit: '100' }),
        )
        assert.deepEqual(
          page.results.map(topic => topic.id),
          children.slice(0, 100),
        )
        assert.equal(page.page_info.has_next_page, true)
        const cursor = page.page_info.end_cursor
        assert.ok(cursor)
        assert.equal(decodeScopedUuidCursor(cursor, scope, 'Invalid cursor').id, children[99])
        const next = await getTopicChildrenPage(
          parentId,
          topicChildrenPaginationParser.parse({ limit: '100', after: cursor }),
        )
        assert.deepEqual(
          next.results.map(topic => topic.id),
          children.slice(100),
        )
        assert.equal(next.page_info.has_next_page, false)
        assert.equal(next.page_info.end_cursor, null)
      },
      undefined,
      'getTopicChildIdPage',
    )
  } finally {
    await write(
      `/* deleteTopicChildrenCapacity */ DELETE FROM relation__topic__parent__topic
       WHERE object_id = $1 AND subject_id = ANY($2::uuid[])`,
      [parentId, ids],
    )
  }
}
