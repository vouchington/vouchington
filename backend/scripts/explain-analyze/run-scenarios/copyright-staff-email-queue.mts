import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import {
  copyrightEmailIntakeQueueParser,
  listCopyrightStaffEmailIntakePage,
} from '@services/copyright-notices/copyright-email-intake-page'
import { copyrightStaffEmailIntakeQueueCursorScope } from '@services/copyright-notices/read-models-staff-email-intakes'
import { getCapturedQueries } from '@voucha/test-helpers/explain-analyze'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { PURGE_EVIDENCE_SEEDED_ROWS } from '../seed-data/copyright-case-purge-volume.mts'
import {
  seedCopyrightStaffEmailQueue,
  STAFF_EMAIL_QUEUE_RECEIVED_AT,
} from '../seed-data/copyright-staff-email-queue.mts'

const PAGE_SIZE = 100
const scenario = 'copyright-staff-email-queue-at-cap'
const queryName = 'searchCopyrightStaffEmailIntakes'
const intakeRelation = 'copyright_notice_email_intakes'

export async function runCopyrightStaffEmailQueueScenario(): Promise<void> {
  const { eligibleIds, replyId, seededRows, cleanup } = await seedCopyrightStaffEmailQueue(
    2 * PAGE_SIZE + 1,
  )
  try {
    await write(`/* analyzeCopyrightStaffEmailQueue */
      ANALYZE copyright_notice_email_intakes, copyright_notice_email_intake_receipts,
        copyright_notice_email_thread_references, copyright_notice_email_message_ancestors`)
    registerScenarioContract(scenario, {
      seededRows: {
        [intakeRelation]: seededRows,
        copyright_notice_email_intake_receipts: seededRows,
        copyright_notice_delivery_work_items: 0,
        copyright_notice_email_intake_notice_links: PURGE_EVIDENCE_SEEDED_ROWS,
        copyright_notice_email_intake_parses: 0,
        copyright_notice_email_thread_references: 2,
        copyright_notice_email_message_ancestors: 1,
        copyright_notice_thread_retention_activities: 0,
      },
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        // The full main-2 corpus shows broad intake and notice-link work. Tighten after #6554.
        { kind: 'maxProcessedRows', relation: intakeRelation, max: 16_409 },
        {
          kind: 'maxProcessedRows',
          relation: 'copyright_notice_email_intake_notice_links',
          max: 2_030_203,
        },
        { kind: 'maxInputRows', nodeType: 'Sort', max: 10_516 },
      ],
    })
    const moderator = { ...seedUser, roles: ['moderator'] }
    const cursorFor = (id: string) =>
      encodeScopedPreciseTimestampCursor(
        STAFF_EMAIL_QUEUE_RECEIVED_AT,
        id,
        copyrightStaffEmailIntakeQueueCursorScope,
      )
    const firstIds = eligibleIds.slice(0, PAGE_SIZE)
    const nextIds = eligibleIds.slice(PAGE_SIZE, 2 * PAGE_SIZE)
    const firstEndId = firstIds.at(-1)!
    await runAndCapture(
      scenario,
      async () => {
        const initial = copyrightEmailIntakeQueueParser.parse({})
        assert.equal(initial.limit, PAGE_SIZE)
        const first = await listCopyrightStaffEmailIntakePage(moderator, initial)
        assert.deepEqual(
          first.copyright_email_intakes.map(intake => intake.id),
          firstIds,
        )
        assert.deepEqual(first.page_info, {
          has_next_page: true,
          start_cursor: cursorFor(firstIds[0]!),
          end_cursor: cursorFor(firstEndId),
        })
        assert.equal(
          first.copyright_email_intakes.find(intake => intake.id === replyId)?.review_path,
          'unresolved_thread',
        )
        const continuation = copyrightEmailIntakeQueueParser.parse({
          after: first.page_info.end_cursor!,
          limit: String(PAGE_SIZE),
        })
        const next = await listCopyrightStaffEmailIntakePage(moderator, continuation)
        assert.deepEqual(
          next.copyright_email_intakes.map(intake => intake.id),
          nextIds,
        )
        assert.deepEqual(next.page_info, {
          has_next_page: true,
          start_cursor: cursorFor(nextIds[0]!),
          end_cursor: cursorFor(nextIds.at(-1)!),
        })
      },
      undefined,
      queryName,
      {
        exactCapturedNames: [queryName, queryName],
        afterCapture: async () => {
          const [first, next] = getCapturedQueries()
          assert.equal(first?.values.at(-1), PAGE_SIZE + 1)
          assert.deepEqual(next?.values.slice(-3), [
            STAFF_EMAIL_QUEUE_RECEIVED_AT,
            firstEndId,
            PAGE_SIZE + 1,
          ])
        },
      },
    )
  } finally {
    await cleanup()
  }
}
