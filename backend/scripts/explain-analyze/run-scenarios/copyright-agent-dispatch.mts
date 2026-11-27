import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { getPendingCopyrightAgentDispatches } from '@services/copyright-notices/reconcile-agent-dispatches'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  analyzeCopyrightAgentDispatch,
  copyrightAgentDispatchStages,
  seedCopyrightAgentDispatch,
} from '../seed-data/copyright-agent-dispatch.mts'

const pageSize = 100
const operation = 'getPendingCopyrightAgentDispatches'

export async function runCopyrightAgentDispatchCapacityScenarios() {
  const fixture = await seedCopyrightAgentDispatch(2 * pageSize + 1)
  try {
    await analyzeCopyrightAgentDispatch()
    for (const kind of copyrightAgentDispatchStages) {
      const pending = fixture.pendingByStage[kind]
      const firstIds = pending.slice(0, pageSize)
      const nextIds = pending.slice(pageSize, 2 * pageSize)
      const cursor: { end?: string } = {}
      for (const [page, ids] of [
        ['first', firstIds],
        ['continuation', nextIds],
      ] as const) {
        const scenario = `copyright-agent-dispatch-${kind}-${page}`
        registerScenarioContract(scenario, {
          seededRows: fixture.seededRows,
          expectations: [
            { kind: 'queryBinds', token: 'LIMIT' },
            // Both modes read fulfilled history before applying the page. Tighten after #6599.
            {
              kind: 'maxProcessedRows',
              relation: 'copyright_notice_submissions',
              max: 9_613,
            },
            { kind: 'maxProcessedRows', relation: 'copyright_notices', max: 6_626 },
            { kind: 'maxInputRows', nodeType: 'Sort', max: page === 'first' ? 702 : 602 },
          ],
        })
        await runAndCapture(
          scenario,
          async () => {
            // Scheduled continuations pass the stage and decoded cursor, with no explicit IDs.
            const result = await getPendingCopyrightAgentDispatches({
              kind,
              after: cursor.end,
              limit: pageSize,
            })
            assert.deepEqual(
              result.results,
              ids.map(submissionId => ({ kind, submissionId })),
            )
            const endCursor = encodeCursor({ id: ids.at(-1)! })
            assert.deepEqual(result.page_info, {
              has_next_page: true,
              start_cursor: encodeCursor({ id: ids[0]! }),
              end_cursor: endCursor,
            })
            cursor.end = endCursor
          },
          page,
          operation,
          { exactCapturedNames: [operation] },
        )
      }
    }
  } finally {
    await fixture.cleanup()
  }
}
