import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { searchDueStatutoryCopyrightRestorationDeadlineIds } from '@services/copyright-notices/statutory-restoration-schedule'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightStatutoryRestoration } from '../seed-data/copyright-statutory-restoration.mts'

const operation = 'searchDueStatutoryCopyrightRestorationDeadlineIds'
const pageSize = 100

export async function runCopyrightStatutoryRestorationCapacityScenarios(): Promise<void> {
  const { batchSize } = getCopyrightSweepLimits('restorations')
  assert.equal(batchSize, pageSize)
  const fixture = await seedCopyrightStatutoryRestoration()
  try {
    assert.equal(fixture.eligibleIds.length, 240)
    let after: string | undefined
    for (const [index, suffix] of ['first', 'continuation'].entries()) {
      const scenario = `copyright-statutory-restoration-${suffix}`
      const ids = fixture.eligibleIds.slice(index * pageSize, (index + 1) * pageSize)
      const cursor: { after?: string; next?: string } = { after }
      registerScenarioContract(scenario, {
        seededRows: fixture.seededRows,
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          // Both modes repeatedly read submissions.
          // Follow-up in https://github.com/vouchington/vouchington/issues/6374#issuecomment-7189051625
          {
            kind: 'maxProcessedRows',
            relation: 'copyright_notice_submissions',
            max: index === 0 ? 27953 : 78453,
          },
          { kind: 'maxProcessedRows', relation: 'copyright_notice_deadlines', max: 1303 },
          { kind: 'maxInputRows', nodeType: 'Sort', max: index === 0 ? 581 : 803 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          const page = await searchDueStatutoryCopyrightRestorationDeadlineIds({
            limit: batchSize,
            after: cursor.after,
            now: fixture.now,
          })
          assert.deepEqual(page.results, ids)
          assert.deepEqual(page.page_info, {
            has_next_page: true,
            start_cursor: encodeCursor({ id: ids[0]! }),
            end_cursor: encodeCursor({ id: ids.at(-1)! }),
          })
          assert.deepEqual(Object.keys(page.candidates), ids)
          for (const id of ids) {
            const actual = page.candidates[id]
            assert.ok(actual)
            assert.deepEqual(
              actual.toSorted((left, right) => left.target_id.localeCompare(right.target_id)),
              fixture.candidates.get(id),
            )
          }
          cursor.next = page.page_info.end_cursor!
        },
        suffix,
        operation,
        { exactCapturedNames: [operation] },
      )
      assert.ok(cursor.next)
      after = cursor.next
    }
  } finally {
    await fixture.cleanup()
  }
}
