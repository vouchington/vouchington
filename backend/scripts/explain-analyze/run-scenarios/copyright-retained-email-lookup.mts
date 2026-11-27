import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import { lookupRetainedCopyrightEmailIntakes } from '@services/copyright-notices/retained-email-intake-lookup'
import { getCapturedQueries } from '@voucha/test-helpers/explain-analyze'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  RETAINED_EMAIL_LOOKUP_TIMESTAMP,
  seedCopyrightRetainedEmailLookup,
} from '../seed-data/copyright-retained-email-lookup.mts'

const pageSize = 100
const senderAddress = 'retained-lookup@example.test'
const operation = 'lookupRetainedCopyrightEmailIntakes'
const firstScenario = 'copyright-retained-email-lookup-first'
const nextScenario = 'copyright-retained-email-lookup-continuation'

export async function runCopyrightRetainedEmailLookupScenarios(): Promise<void> {
  const fixture = await seedCopyrightRetainedEmailLookup(pageSize, senderAddress)
  try {
    await write(`/* analyzeRetainedEmailLookup */
      ANALYZE copyright_notice_email_intakes, copyright_notice_email_intake_receipts,
        copyright_notice_email_intake_parses, copyright_notice_email_intake_notice_links`)
    const staff = { ...seedUser, roles: ['moderator'] }
    const scope = `copyright-email-intakes:retained-lookup:${hashToken('copyright-retained-intake-lookup', senderAddress)}`
    const cursorFor = (id: string) =>
      encodeScopedPreciseTimestampCursor(RETAINED_EMAIL_LOOKUP_TIMESTAMP, id, scope)
    const firstIds = fixture.visibleIds.slice(0, pageSize)
    const firstEndId = firstIds.at(-1)!
    const capture = async (scenario: string, ids: string[], after?: string) => {
      registerScenarioContract(scenario, {
        seededRows: fixture.seededRows,
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          {
            kind: 'usesIndexes',
            indexes: ['idx_copyright_notice_email_intakes__received_id'],
            noSort: true,
          },
          { kind: 'maxProcessedRows', relation: 'copyright_notice_email_intakes', max: 127 },
          {
            kind: 'maxProcessedRows',
            relation: 'copyright_notice_email_intake_receipts',
            max: 102,
          },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          const reference = (id: string) => ({ id, linked_notice_id: null })
          assert.deepEqual(
            await lookupRetainedCopyrightEmailIntakes(staff, {
              senderAddress: ` ${senderAddress.toUpperCase()} `,
              limit: pageSize,
              after,
            }),
            {
              matches: ids.filter(id => fixture.matches.has(id)).map(reference),
              raw_review_candidates: ids.filter(id => fixture.rawIds.has(id)).map(reference),
              scanned_count: pageSize,
              next_cursor: cursorFor(ids.at(-1)!),
            },
          )
        },
        after ? 'continuation' : 'first',
        operation,
        {
          exactCapturedNames: [operation],
          afterCapture: async () => {
            const [query] = getCapturedQueries()
            assert.deepEqual(
              query?.values,
              after ? [RETAINED_EMAIL_LOOKUP_TIMESTAMP, firstEndId, pageSize + 1] : [pageSize + 1],
            )
          },
        },
      )
    }
    await capture(firstScenario, firstIds)
    await capture(
      nextScenario,
      fixture.visibleIds.slice(pageSize, 2 * pageSize),
      cursorFor(firstEndId),
    )
  } finally {
    await fixture.cleanup()
  }
}
