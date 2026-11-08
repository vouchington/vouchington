import { beginTransaction, read } from '@data-stores/psql'
import {
  activateOldestQueuedGrant,
  activateOldestQueuedGrantForLockedUser,
} from '@services/memberships/grants/activate-queued'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  EXPIRY_PAGE_MEMBERSHIP_IDS,
  EXPIRY_PAGE_CLOSED_ACTIVATIONS,
  EXPIRY_PAGE_USER_IDS,
} from '../seed-data/membership-expiry-pages.mts'

const PAGE_CHANGES = 2 // One expiration and one replacement per current-projection page.

export async function runMembershipExpiryPageScenarios(): Promise<void> {
  const { rows } = await read<{
    id: string
    user_id: string
    membership_source_id: string
    membership_product_id: string
    expires_at: Date
  }>(
    `/* readMembershipExpiryPageFixture */ SELECT id,user_id,membership_source_id,
       membership_product_id,expires_at FROM memberships WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [EXPIRY_PAGE_MEMBERSHIP_IDS],
  )
  if (rows.length !== PAGE_CHANGES) throw new Error('Membership expiry fixture is incomplete')
  const closed = rows.find(row => row.user_id === EXPIRY_PAGE_USER_IDS[0])!
  registerScenarioContract('membership-expiry-page-activation', {
    seededRows: { membership_grant_activation_periods: EXPIRY_PAGE_CLOSED_ACTIVATIONS },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 1 },
      { kind: 'maxProcessedRows', relation: 'membership_grants', max: 3 },
      { kind: 'maxProcessedRows', relation: 'membership_source_states', max: 6 },
      { kind: 'maxProcessedRows', relation: 'membership_grant_activation_periods', max: 4 },
    ],
  })
  await runAndCapture(
    'membership-expiry-page-activation',
    async () => {
      await using transaction = await beginTransaction()
      await transaction('/* lockExpiryFixtureUser */ SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        closed.user_id,
      ])
      await activateOldestQueuedGrantForLockedUser(closed.user_id, closed, transaction)
    },
    undefined,
    'activateOldestQueuedGrant',
  )

  registerScenarioContract('membership-expiry-user-lock', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'users', max: 1 }],
  })
  await runAndCapture(
    'membership-expiry-user-lock',
    async () => {
      await using transaction = await beginTransaction()
      await activateOldestQueuedGrant(closed.user_id, closed, transaction)
    },
    undefined,
    'activateOldestQueuedGrant: lock user',
  )
}

