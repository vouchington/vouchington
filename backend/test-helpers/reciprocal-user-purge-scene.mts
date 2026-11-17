import { write } from '@data-stores/psql'
import { createTestRetentionWindow } from './data.mts'
import { createTestUserDirect, getTestUserRaw, softDeleteUserAt } from './entities/users.mts'
import { createReferralSignupNotification } from '../services/notifications/create-referral-signup-notification.mts'
import { releaseUserPreservationHold } from '../services/users/preservation-holds.mts'
import {
  createTestPreservationHold,
  readPreservationHoldsForTest,
} from './entities/user-legal-preservation-holds.mts'
import { readTestRetainedUserLegalClocks } from './entities/retained-user-legal-clocks.mts'
import {
  setReciprocalTestUserDeletionActors,
  setTestUserPurgeWitness,
  readTestUserPurgeReferences,
} from './reciprocal-user-purge.mts'

type Target = { userId: string; witnessId: string; notificationId: string }

export async function readTestPurgeAccountState(userId: string) {
  const { rows } = await write<{ pending: boolean; notifications: number; push_intents: number }>(
    `/* readTestPurgeAccountState */ SELECT identity.is_copyright_case_clock_sync_pending AS pending,
      (SELECT count(*)::integer FROM notifications WHERE user_id=identity.id) AS notifications,
      (SELECT count(*)::integer FROM notification_push_intents WHERE user_id=identity.id) AS push_intents
    FROM retained_user_identities identity WHERE identity.id=$1::uuid`,
    [userId],
  )
  if (!rows[0]) throw new Error('Retained purge identity is missing')
  return {
    user: await getTestUserRaw(userId),
    references: await readTestUserPurgeReferences(userId),
    clock: await readTestRetainedUserLegalClocks(userId),
    holds: await readPreservationHoldsForTest(userId),
    pending: rows[0].pending,
    notifications: { notifications: rows[0].notifications, push_intents: rows[0].push_intents },
  }
}

export async function readTestPurgeSceneState(target: Target) {
  const { rows } = await write<{
    notification: boolean
    push_intents: number
  }>(
    `/* readTestPurgeSceneNotification */ SELECT
      EXISTS(SELECT 1 FROM notifications WHERE user_id=$1::uuid AND id=$2::uuid) AS notification,
      (SELECT count(*)::integer FROM notification_push_intents
        WHERE user_id=$1::uuid AND notification_id=$2::uuid) AS push_intents`,
    [target.userId, target.notificationId],
  )
  return {
    ...(await readTestPurgeAccountState(target.userId)),
    witness: await getTestUserRaw(target.witnessId),
    witnessReferences: await readTestUserPurgeReferences(target.witnessId),
    notification: { notification: rows[0]!.notification, push_intents: rows[0]!.push_intents },
  }
}

/** Valid owned sources include child writes that must roll back, retained history and a held outsider. */
export async function createReciprocalTestPurgeScene() {
  const [first, second, firstWitness, secondWitness, held, heldWitness] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
    createTestUserDirect({ administrator: true }),
    createTestUserDirect(),
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const users = [first, second, held]
  const witnesses = [firstWitness, secondWitness, heldWitness]
  await Promise.all([
    setTestUserPurgeWitness(firstWitness.id, first.id),
    setTestUserPurgeWitness(secondWitness.id, second.id),
    setTestUserPurgeWitness(heldWitness.id, held.id),
  ])
  const targets = await Promise.all(
    users.map(async (user, index) => {
      const witness = witnesses[index]!
      const rows = await createReferralSignupNotification(user.id, witness.id, witness.username)
      if (!rows[0]) throw new Error('Owned purge notification was not created')
      await createTestPreservationHold(
        user.id,
        firstWitness.id,
        'synthetic retained purge evidence',
      )
      if (index < 2) await releaseUserPreservationHold(firstWitness, user.id)
      return { userId: user.id, witnessId: witness.id, notificationId: rows[0].id }
    }),
  )
  const window = createTestRetentionWindow()
  await setReciprocalTestUserDeletionActors(first.id, second.id, window.firstEligibleDate)
  await softDeleteUserAt(held.id, window.firstEligibleDate)
  return {
    targets: targets.slice(0, 2),
    held: targets[2]!,
    cutoff: window.upperBoundDate,
    before: await Promise.all([
      readTestPurgeSceneState(targets[0]!),
      readTestPurgeSceneState(targets[1]!),
    ]),
    heldBefore: await readTestPurgeSceneState(targets[2]!),
  }
}
