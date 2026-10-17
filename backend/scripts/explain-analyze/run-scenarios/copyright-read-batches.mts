import { beginTransaction } from '@data-stores/psql'
import { getCopyrightJurisdictionAvailability } from '@services/copyright-notices/jurisdiction-policy'
import { selectCopyrightTargetPosters } from '@services/copyright-notices/restriction-poster-notices'
import { getTerritorialInformedWindows } from '@services/copyright-notices/territorial-informed-at'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const LISTED = 10

/** The recipients, complaint windows and availability read for a whole page at once. */
export async function runCopyrightReadBatchScenarios(seeded: {
  noticeId: string
  targetId: string
}): Promise<void> {
  await runTargetPosters(seeded.targetId)
  await runInformedWindows(seeded.noticeId)
  await runJurisdictionAvailability()
}

// Poster and community-owner recipients of one target come back in one statement.
async function runTargetPosters(targetId: string): Promise<void> {
  registerScenarioContract('copyright-target-posters', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 2 }],
  })
  await runAndCapture(
    'copyright-target-posters',
    async () => {
      await using transaction = await beginTransaction()
      const parties = await selectCopyrightTargetPosters([targetId], transaction, [
        'notify',
        'inform',
      ])
      await transaction.rollback()
      if (parties.length === 0) throw new Error('The seeded target needs at least one poster')
    },
    undefined,
    'selectCopyrightTargetPosters',
  )
}

// One statement answers the informed-at window of every listed complaint.
async function runInformedWindows(noticeId: string): Promise<void> {
  registerScenarioContract('copyright-informed-windows', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'copyright_notice_delivery_work_items', max: 3 },
    ],
    // The development seed files a handful of deliveries; the notice index serves a larger table.
    seededRows: { copyright_notice_delivery_work_items: 100 },
  })
  await runAndCapture(
    'copyright-informed-windows',
    async () => {
      await using transaction = await beginTransaction()
      const windows = await getTerritorialInformedWindows(
        Array.from({ length: LISTED }, (_, index) => ({
          noticeId,
          decidedAt: new Date(0),
          notifier: true,
          posterUserId: index % 2 === 0 ? seedUser.id : undefined,
        })),
        transaction,
      )
      await transaction.rollback()
      if (windows.length !== LISTED) throw new Error('Every listed complaint needs a window')
    },
    undefined,
    'getTerritorialInformedWindows',
  )
}

// Both territories' availability comes back in one statement; the seed approves neither.
async function runJurisdictionAvailability(): Promise<void> {
  registerScenarioContract('copyright-jurisdiction-availability', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'copyright_jurisdiction_policy_approvals', max: 5 },
    ],
    allowEmptyResult: true,
  })
  await runAndCapture(
    'copyright-jurisdiction-availability',
    () => getCopyrightJurisdictionAvailability(),
    undefined,
    'getCopyrightJurisdictionAvailability',
  )
}
