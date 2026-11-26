import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { searchUserLists } from '@services/lists/lists'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const SCENARIO_ID = 'search-user-lists-at-cap'
const QUERY_NAME = 'searchUserLists'
const PAGE_LIMIT = 100
const OWNER_ID = seedUuid(19_994, '01')

export async function runUserListCapacityScenario(): Promise<void> {
  const ownerLists = Array.from({ length: 148 }, (_, index) => ({
    id: seedUuid(7_000_000 + index, '34'),
    owner_id: OWNER_ID,
    visibility: index % 7 === 0 ? 'private' : index % 5 === 0 ? 'unlisted' : 'public',
    removed: index % 11 === 0,
  })).toReversed()
  const otherLists = Array.from({ length: 2_400 }, (_, index) => ({
    id: seedUuid(7_000_148 + index, '34'),
    owner_id: seedUuid(10_000 + (index % 160), '01'),
    visibility: index % 3 === 0 ? 'private' : 'public',
    removed: index % 13 === 0,
  }))
  const lists = [...ownerLists, ...otherLists]
  const cleanup = () =>
    write(sql`/* cleanupUserListCapacity */
      DELETE FROM user_lists WHERE id = ANY(${lists.map(list => list.id)}::uuid[])
    `)
  await cleanup()
  try {
    await write(sql`/* seedUserListCapacity */
      INSERT INTO user_lists (id, created_via, owner_user_id, name, visibility, removed_at)
      SELECT list.id, 'system', list.owner_id, 'Capacity fixture ' || list.id::text,
        list.visibility, CASE WHEN list.removed THEN CURRENT_TIMESTAMP END
      FROM jsonb_to_recordset(${JSON.stringify(lists)}::jsonb)
        AS list(id uuid, owner_id uuid, visibility list_visibilities, removed boolean)
    `)
    await write('/* analyzeUserListCapacity */ ANALYZE user_lists')
    registerScenarioContract(SCENARIO_ID, {
      expectations: [],
      seededRows: { user_lists: (SEEDED_ROWS_BY_RELATION.user_lists ?? 0) + lists.length },
    })
    await runAndCapture(
      SCENARIO_ID,
      async () => {
        for (const includePrivate of [true, false]) {
          const expectedIds = ownerLists
            .filter(list => !list.removed && (includePrivate || list.visibility !== 'private'))
            .map(list => list.id)
          const first = await searchUserLists(OWNER_ID, { limit: PAGE_LIMIT, includePrivate })
          assert.deepEqual(
            first.results.map(list => list.id),
            expectedIds.slice(0, PAGE_LIMIT),
          )
          assert.equal(first.page_info.has_next_page, true)
          const after = first.page_info.end_cursor
          assert.equal(after, encodeCursor({ id: expectedIds[PAGE_LIMIT - 1]! }))

          const next = await searchUserLists(OWNER_ID, {
            limit: PAGE_LIMIT,
            includePrivate,
            after: after!,
          })
          assert.deepEqual(
            next.results.map(list => list.id),
            expectedIds.slice(PAGE_LIMIT),
          )
          assert.equal(next.page_info.has_next_page, false)
        }
      },
      undefined,
      QUERY_NAME,
      { exactCapturedNames: [QUERY_NAME, QUERY_NAME, QUERY_NAME, QUERY_NAME] },
    )
  } finally {
    await cleanup()
    await write('/* analyzeAfterUserListCapacity */ ANALYZE user_lists')
  }
}
