import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { searchRecoverableDsaStatementSubmissionIds } from '@services/copyright-notices/dsa-statement-submission-sweep'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightDsaRecovery } from '../seed-data/copyright-dsa-recovery.mts'

// The scheduled reconciler uses the copyright sweep default, which is also the SQL pager maximum.
const pageSize = 100
const operation = 'searchRecoverableDsaStatementSubmissionIds'

export async function runCopyrightDsaRecoveryCapacityScenarios(): Promise<void> {
  const from = new Date(Date.now() - 7 * 86_400_000)
  const existing = await searchRecoverableDsaStatementSubmissionIds({ from, limit: pageSize })
  assert.deepEqual(
    existing.results,
    [],
    'DSA recovery fixture needs an empty due set before seeding',
  )
  const fixture = await seedCopyrightDsaRecovery(from, pageSize + 1)
  try {
    const firstIds = fixture.eligible.slice(0, pageSize)
    const remainingIds = fixture.eligible.slice(pageSize)
    assert.equal(firstIds.length, pageSize)
    assert.equal(remainingIds.length, 1)
    const firstEnd = encodeCursor({ id: firstIds.at(-1)! })
    const capture = async (scenario: string, ids: string[], hasMore: boolean, after?: string) => {
      registerScenarioContract(scenario, {
        seededRows: fixture.seededRows,
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          // Main scans terminal submissions and attempt history. Tighten after #6562.
          {
            kind: 'maxProcessedRows',
            relation: 'copyright_dsa_statement_submissions',
            max: after ? 2_006 : 7_202,
          },
          {
            kind: 'maxProcessedRows',
            relation: 'copyright_dsa_statement_submission_attempts',
            max: after ? 22_285 : 15_367,
          },
          { kind: 'maxInputRows', nodeType: 'Sort', max: after ? 1_803 : 0 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          assert.deepEqual(
            await searchRecoverableDsaStatementSubmissionIds({ from, limit: pageSize, after }),
            {
              results: ids,
              page_info: {
                has_next_page: hasMore,
                start_cursor: encodeCursor({ id: ids[0]! }),
                end_cursor: hasMore ? encodeCursor({ id: ids.at(-1)! }) : null,
              },
            },
          )
        },
        after ? 'continuation' : 'first',
        operation,
        { exactCapturedNames: [operation], useWallClock: true },
      )
    }
    await capture('copyright-dsa-recovery-first-page', firstIds, true)
    await capture('copyright-dsa-recovery-continuation', remainingIds, false, firstEnd)
  } finally {
    await fixture.retireFixtures()
  }
}
