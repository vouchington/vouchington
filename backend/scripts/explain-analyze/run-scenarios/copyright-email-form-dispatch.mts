import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { getPendingCopyrightAgentDispatches } from '@services/copyright-notices/reconcile-agent-dispatches'
import { getCopyrightAgentDispatchLimits } from '@services/copyright-notices/work-limits'
import { registerScenarioContract, type PlanExpectation } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightEmailDispatch } from '../seed-data/copyright-email-dispatch.mts'
import { seedCopyrightFormDispatch } from '../seed-data/copyright-form-dispatch.mts'

const pageSize = 100
const operation = 'getPendingCopyrightAgentDispatches'
const stageNames = ['email', 'form-screening', 'form-effect'] as const
const stagePlanCaps = {
  email: [
    // Both plans scan retained intake and parse history. Tighten after #6619.
    { kind: 'maxProcessedRows', relation: 'copyright_notice_email_intakes', max: 9_824 },
    { kind: 'maxProcessedRows', relation: 'copyright_notice_email_intake_parses', max: 2_254 },
    { kind: 'maxInputRows', nodeType: 'Sort', max: 232 },
  ],
  'form-screening': [
    // The first page rescans live lease work. Tighten after #6620.
    {
      kind: 'maxProcessedRows',
      relation: 'copyright_notice_form_screening_work_items',
      max: 1_201_000,
    },
    { kind: 'maxProcessedRows', relation: 'copyright_notice_form_intakes', max: 2_404 },
    { kind: 'maxInputRows', nodeType: 'Sort', max: 201 },
  ],
  'form-effect': [
    // Both modes sort form and delivery work before applying the limit. Tighten after #6621.
    { kind: 'maxProcessedRows', relation: 'copyright_notice_delivery_work_items', max: 2_408 },
    { kind: 'maxProcessedRows', relation: 'copyright_notice_form_intakes', max: 2_404 },
    { kind: 'maxInputRows', nodeType: 'Sort', max: 5_009 },
  ],
} satisfies Record<(typeof stageNames)[number], PlanExpectation[]>

export async function runCopyrightEmailFormDispatchCapacityScenarios() {
  // These IDs precede the shared EXPLAIN fixtures without adding a test-only IDs predicate.
  const timestamp = Date.UTC(1970, 0, 2) + randomInt(86_400_000)
  const email = await seedCopyrightEmailDispatch(timestamp, 2 * pageSize + 1)
  try {
    const form = await seedCopyrightFormDispatch(timestamp, 2 * pageSize + 1)
    try {
      await write(`/* analyzeCopyrightEmailFormDispatch */
        ANALYZE copyright_notice_email_intake_receipts, copyright_notice_email_intakes,
          copyright_notice_email_intake_parses, copyright_notices, copyright_notice_submissions,
          copyright_notice_form_intakes, copyright_notice_form_screening_attempts,
          copyright_notice_form_screening_work_items, copyright_notice_form_screenings,
          copyright_notice_targets, copyright_notice_target_images,
          copyright_notice_delivery_work_items, copyright_notice_delivery_recipients`)
      const pending = { email: email.pendingIds, ...form.pendingByStage }
      const seededRows = { ...email.seededRows, ...form.seededRows }
      for (const kind of stageNames) {
        const { batchSize } = getCopyrightAgentDispatchLimits(kind)
        assert.equal(batchSize, pageSize)
        const cursor: { after?: string } = {}
        for (const [index, suffix] of ['first', 'continuation'].entries()) {
          const expected = pending[kind].slice(index * pageSize, (index + 1) * pageSize)
          const scenario = `copyright-agent-dispatch-${kind}-${suffix}`
          registerScenarioContract(scenario, {
            seededRows,
            expectations: [{ kind: 'queryBinds', token: 'LIMIT' }, ...stagePlanCaps[kind]],
          })
          await runAndCapture(
            scenario,
            async () => {
              const page = await getPendingCopyrightAgentDispatches({
                kind,
                limit: batchSize,
                after: cursor.after,
              })
              assert.deepEqual(
                page.results,
                expected.map(id =>
                  kind === 'email' ? { kind, intakeId: id } : { kind, submissionId: id },
                ),
              )
              assert.deepEqual(page.page_info, {
                has_next_page: true,
                start_cursor: encodeCursor({ id: expected[0]! }),
                end_cursor: encodeCursor({ id: expected.at(-1)! }),
              })
              cursor.after = page.page_info.end_cursor!
            },
            `${kind}-${suffix}`,
            operation,
            // Screening work leases are seeded relative to the database's wall clock.
            { exactCapturedNames: [operation], useWallClock: true },
          )
        }
      }
    } finally {
      await form.cleanup()
    }
  } finally {
    await email.cleanup()
  }
}
