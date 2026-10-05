import { describe, expect, it } from 'vitest'
import { cleanupRetainedIdentityRoots } from '../data-retention/cleanup-retained-identities.mts'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getTestPrivateUserById,
  hardDeleteTestUser,
} from '@voucha/test-helpers/entities/users'
import { hasTestRetainedIdentityRoot } from '@voucha/test-helpers/entities/retained-identities'
import {
  readTestEuRedressAttribution,
  readTestEuRedressAttributions,
} from '@voucha/test-helpers/copyright-eu-redress-attribution'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { createTestEuParticipantCase } from '@voucha/test-helpers/copyright-eu-participant-cases'
import { createTestGuestEuCase } from '@voucha/test-helpers/copyright-eu-guest-cases'
import { admitTestGuestTerritorialComplaintEmail } from '@voucha/test-helpers/copyright-territorial-complaint-email'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { submitEuCopyrightRedress } from './eu-redress.mts'

describe('retained submitter attribution for EU redress', () => {
  useCopyrightIntakeEnvironment()

  it('preserves notifier, poster, and reviewer request identities through hard deletion', async () => {
    const scene = await createTestEuParticipantCase('restrict')
    const reviewer = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = scene.receipt.notice_id
    const notifierRequest = await submitEuCopyrightRedress(
      scene.notifier,
      noticeId,
      crypto.randomUUID(),
      `Notifier complaint ${scene.suffix}`,
    )
    const posterRequest = await submitEuCopyrightRedress(
      scene.poster,
      noticeId,
      crypto.randomUUID(),
      `Poster complaint ${scene.suffix}`,
    )
    const reviewerRequest = await submitEuCopyrightRedress(
      reviewer,
      noticeId,
      crypto.randomUUID(),
      `Reviewer complaint ${scene.suffix}`,
    )
    const requestIds = [notifierRequest.id, posterRequest.id, reviewerRequest.id]
    expect(new Set(requestIds).size).toBe(3)
    await expect(Promise.all(requestIds.map(readTestEuRedressAttribution))).resolves.toEqual([
      { submitted_by_id: scene.notifier.id, filed_by: 'notifier' },
      { submitted_by_id: scene.poster.id, filed_by: 'poster' },
      { submitted_by_id: reviewer.id, filed_by: 'reviewer' },
    ])

    const notifierSession = createRequest()
    const reviewerSession = createRequest()
    await notifierSession.authenticateAs(scene.notifier)
    await reviewerSession.authenticateAs(reviewer)
    await deleteUserAndDrainForTest(scene.notifier, scene.notifier)
    await deleteUserAndDrainForTest(reviewer, reviewer)
    expect(await getTestPrivateUserById(scene.notifier.id)).toBeNull()
    expect(await getTestPrivateUserById(reviewer.id)).toBeNull()
    await hardDeleteTestUser(scene.notifier.id)
    await hardDeleteTestUser(reviewer.id)
    await cleanupRetainedIdentityRoots(1_000, { user: [scene.notifier.id, reviewer.id] })

    expect(await hasTestRetainedIdentityRoot('user', scene.notifier.id)).toBe(true)
    expect(await hasTestRetainedIdentityRoot('user', reviewer.id)).toBe(true)
    const retained = await Promise.all(requestIds.map(readTestEuRedressAttribution))
    expect(retained).toEqual([
      { submitted_by_id: scene.notifier.id, filed_by: 'notifier' },
      { submitted_by_id: scene.poster.id, filed_by: 'poster' },
      { submitted_by_id: reviewer.id, filed_by: 'reviewer' },
    ])
    await notifierSession.get(`/api/v1/copyright-notices/${noticeId}/participant`).expect(401)
    await reviewerSession.get(`/api/v1/copyright-notices/${noticeId}/participant`).expect(401)
  })

  it('keeps one genuine guest complaint on its own guest-notifier decision', async () => {
    const scene = await createTestGuestEuCase('decided')
    const { admitted } = await admitTestGuestTerritorialComplaintEmail({
      currentUser: scene.staff,
      noticeId: scene.noticeId,
      senderEmail: scene.email,
    })
    expect(admitted.noticeId).toBe(scene.noticeId)
    const attribution = await readTestEuRedressAttributions(scene.noticeId)
    expect(attribution).toHaveLength(1)
    expect(attribution[0]).toMatchObject({ submitted_by_id: null, filed_by: 'notifier' })
    await expect(
      admitTestGuestTerritorialComplaintEmail({
        currentUser: scene.staff,
        noticeId: scene.noticeId,
        senderEmail: scene.email,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
})
