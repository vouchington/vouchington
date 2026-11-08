import { beginTransaction, write } from '@data-stores/psql'
import { expireElapsedMemberships } from '@services/memberships/grants/expire-elapsed'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  EXPIRY_PAGE_MEMBERSHIP_IDS,
  EXPIRY_PAGE_USER_IDS,
} from '../seed-data/membership-expiry-pages.mts'

/** Replay the single current-projection candidate UPDATE without committing the expiry. */
export async function runMembershipExpiryCandidateScenario(): Promise<void> {
  const { rows } = await write<{ expires_at: Date }>(
    `/* prepareMembershipExpiryCandidate */ UPDATE memberships SET expired_at = NULL
     WHERE id = $1::uuid RETURNING expires_at`,
    [EXPIRY_PAGE_MEMBERSHIP_IDS[0]],
  )
  const expiresAt = rows[0]?.expires_at
  if (!expiresAt) throw new Error('Membership expiry candidate fixture is missing')
  const expiresThrough = new Date(expiresAt.getTime() + 1_000)
  try {
    registerScenarioContract('membership-expiry-current-candidate', {
      // One candidate scan, one keyed target scan, and one returned UPDATE row.
      expectations: [
        { kind: 'maxProcessedRows', relation: 'memberships', max: 3 },
        { kind: 'maxProcessedRows', relation: 'membership_sources', max: 2 },
      ],
    })
    await runAndCapture(
      'membership-expiry-current-candidate',
      async () => {
        await using transaction = await beginTransaction()
        const result = await expireElapsedMemberships(EXPIRY_PAGE_USER_IDS[0]!, transaction, {
          activateQueuedGrants: false,
          expiresThrough,
          limits: { batchSize: 1, maxBatches: 1 },
        })
        if (result.expired !== 1) throw new Error('Membership expiry candidate did not expire')
      },
      undefined,
      'expireElapsedMemberships',
    )
  } finally {
    await write(
      `/* restoreMembershipExpiryCandidate */ UPDATE memberships SET expired_at = expires_at
       WHERE id = $1::uuid`,
      [EXPIRY_PAGE_MEMBERSHIP_IDS[0]],
    )
  }
}
