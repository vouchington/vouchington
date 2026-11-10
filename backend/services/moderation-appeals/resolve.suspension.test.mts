import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import {
  createTestUser,
  deleteTestMembershipPauseCollectionWork,
  getTestMembershipPauseCollectionRequestedAt,
  suspendTestUserGetId,
  getTestUserSuspension,
  getLatestTestAppealTrainingFeedback,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput } from './parse.mts'
import { resolveModerationAppealAccept } from './resolve.mts'
import { deliverModerationAppealForTest } from '@voucha/test-helpers/services/moderation-appeals/resolution.fixtures'
import * as psqlEnqueues from '@queues/psql/enqueues'

describe('resolveModerationAppealAccept — suspension', () => {
  let admin: PrivateUser
  let moderator: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    moderator = await createTestUser({ extraRoles: ['moderator'] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lifts the platform suspension when an administrator accepts a suspension appeal', async () => {
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')
    const suspensionUser = await createTestUser()
    const suspensionId = await suspendTestUserGetId(suspensionUser.id, 'Test suspension')
    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: 'I was suspended in error.',
    })
    const { appeal } = await createModerationAppeal(suspensionUser, WEB_PROVENANCE, input)
    expect(appeal.user_suspension_id).toBe(suspensionId)

    await deliverModerationAppealForTest(admin.id, appeal.id)
    refreshTopHashtags.mockClear()
    await resolveModerationAppealAccept(admin.id, appeal.id, 'staff_or_user')

    const suspension = await getTestUserSuspension(suspensionId)
    expect(suspension?.lifted_at).not.toBeNull()
    await expect(
      getTestMembershipPauseCollectionRequestedAt(suspensionUser.id),
    ).resolves.toBeInstanceOf(Date)
    await deleteTestMembershipPauseCollectionWork(suspensionUser.id)
    expect(refreshTopHashtags).toHaveBeenCalledOnce()
    await expect(getLatestTestAppealTrainingFeedback(appeal.id)).resolves.toEqual({
      label: 'accepted',
      post_id: null,
    })
  })

  it('rejects suspension appeal acceptance from a non-admin staff member', async () => {
    const suspensionUser = await createTestUser()
    await suspendTestUserGetId(suspensionUser.id, 'Test suspension')
    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: 'I was suspended in error.',
    })
    const { appeal } = await createModerationAppeal(suspensionUser, WEB_PROVENANCE, input)

    await deliverModerationAppealForTest(moderator.id, appeal.id)
    await expect(
      resolveModerationAppealAccept(moderator.id, appeal.id, 'staff_or_user'),
    ).rejects.toMatchObject({
      status: 403,
    })
  })
})
