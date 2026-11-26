import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { searchRecoverableCopyrightFormReviewIntakeIds } from '@services/copyright-notices/form-reviews-recovery'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightFormReviewRecovery } from '../seed-data/copyright-form-review-recovery.mts'

const operation = 'searchRecoverableCopyrightFormReviewIntakeIds'

export async function runCopyrightFormReviewRecoveryScenarios() {
  const { batchSize: limit } = getCopyrightSweepLimits('forms')
  assert.equal(limit, 100)
  const fixture = await seedCopyrightFormReviewRecovery(2 * limit + 1)
  try {
    await write(`/* analyzeCopyrightFormReviewRecovery */
      ANALYZE copyright_notice_form_intake_reviews, copyright_notice_form_intakes,
        copyright_notice_submissions, copyright_notice_submission_assessment_identities`)
    const cursor: { after?: string } = {}
    for (const [index, suffix] of ['first', 'continuation'].entries()) {
      const expected = fixture.pendingIds.slice(index * limit, (index + 1) * limit)
      const scenario = `copyright-form-review-recovery-${suffix}`
      registerScenarioContract(scenario, {
        seededRows: fixture.seededRows,
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          // Main can scan submission and restriction history. See the #6374 plan checklist.
          { kind: 'maxProcessedRows', relation: 'copyright_notice_submissions', max: 16_835 },
          { kind: 'maxProcessedRows', relation: 'copyright_notice_form_intakes', max: 5_005 },
          { kind: 'maxProcessedRows', relation: 'copyright_restrictions', max: 9_202 },
          { kind: 'maxInputRows', nodeType: 'Sort', max: 9_403 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          const page = await searchRecoverableCopyrightFormReviewIntakeIds({
            limit,
            after: cursor.after,
          })
          assert.deepEqual(page, {
            results: expected,
            page_info: {
              has_next_page: true,
              start_cursor: encodeCursor({ id: expected[0]! }),
              end_cursor: encodeCursor({ id: expected.at(-1)! }),
            },
          })
          cursor.after = page.page_info.end_cursor!
        },
        suffix,
        operation,
        { exactCapturedNames: [operation] },
      )
    }
  } finally {
    await fixture.retire()
  }
}
