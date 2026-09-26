import { describe, it, expect, beforeAll, vi } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  suspendTestUserGetId,
  getTestUserSuspension,
  hardDeleteTestUserAndWaitBeforeCommit,
  isTestAuthorPublicationLifecycleLockWaiting,
  lockTestUserSuspension,
  getLatestTestAppealTrainingFeedback,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput } from './parse.mts'
import { resolveModerationAppealAccept } from './resolve.mts'
import { liftUserSuspensionById } from './lift-sanctions.mts'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { deliverModerationAppealForTest } from './resolution.test-helpers.mts'
import * as psqlEnqueues from '@queues/psql/enqueues'

describe('resolveModerationAppealAccept — suspension', () => {
  let admin: PrivateUser
  let moderator: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    moderator = await createTestUser({ extraRoles: ['moderator'] })
  })

  it('lifts the platform suspension when an administrator accepts a suspension appeal', async () => {
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')
    const suspensionUser = await createTestUser()
    const suspensionId = await suspendTestUserGetId(suspensionUser.id, 'Test suspension')
    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: 'I was suspended in error.',
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, suspensionUser, input)
    expect(appeal.user_suspension_id).toBe(suspensionId)

    await deliverModerationAppealForTest(admin.id, appeal.id)
    refreshTopHashtags.mockClear()
    await resolveModerationAppealAccept(admin.id, appeal.id)

    const suspension = await getTestUserSuspension(suspensionId)
    expect(suspension?.lifted_at).not.toBeNull()
    expect(refreshTopHashtags).toHaveBeenCalledOnce()
    await expect(getLatestTestAppealTrainingFeedback(appeal.id)).resolves.toEqual({
      label: 'accepted',
      post_id: null,
    })
  })

  it('takes the author lifecycle lock before waiting on a suspension row', async () => {
    const suspensionUser = await createTestUser()
    const suspensionId = await suspendTestUserGetId(suspensionUser.id, 'Test suspension')
    const suspensionRowLocked = Promise.withResolvers<void>()
    const releaseSuspensionRow = Promise.withResolvers<void>()
    async function holdSuspensionRow() {
      await using query = await beginTransaction()
      await lockTestUserSuspension(query, suspensionId)
      suspensionRowLocked.resolve()
      await releaseSuspensionRow.promise
      await query.commit()
    }
    const holder = holdSuspensionRow()
    await suspensionRowLocked.promise

    const lift = liftUserSuspensionById(admin.id, suspensionId, {})
    try {
      await vi.waitFor(async () => {
        await expect(probeAuthorLifecycleLock(suspensionUser.id)).rejects.toMatchObject({
          code: '55P03',
        })
      })
    } finally {
      releaseSuspensionRow.resolve()
    }
    await holder
    await lift

    await expect(getTestUserSuspension(suspensionId)).resolves.toMatchObject({
      lifted_at: expect.any(Date),
    })
  })

  it('does not deadlock with user deletion while accepting a suspension appeal', async () => {
    const suspensionUser = await createTestUser()
    const suspensionId = await suspendTestUserGetId(suspensionUser.id, 'Test suspension')
    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: 'I was suspended in error.',
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, suspensionUser, input)
    expect(appeal.user_suspension_id).toBe(suspensionId)
    await deliverModerationAppealForTest(admin.id, appeal.id)

    const deletionMayProceed = Promise.withResolvers<void>()
    const deletionHoldsAuthorLifecycle = Promise.withResolvers<void>()
    const deleting = hardDeleteTestUserAndWaitBeforeCommit(
      suspensionUser.id,
      Promise.resolve(),
      undefined,
      async query => {
        await lockAuthorPublicationLifecycle(query, suspensionUser.id)
        deletionHoldsAuthorLifecycle.resolve()
        await deletionMayProceed.promise
      },
    )
    await deletionHoldsAuthorLifecycle.promise

    const resolving = resolveModerationAppealAccept(admin.id, appeal.id)
    const resolvingRejection = resolving.catch((error: unknown) => error)
    try {
      await vi.waitFor(async () => {
        await expect(isTestAuthorPublicationLifecycleLockWaiting(suspensionUser.id)).resolves.toBe(
          true,
        )
      })
    } finally {
      deletionMayProceed.resolve()
    }

    await expect(deleting).resolves.toBeUndefined()
    await expect(resolvingRejection).resolves.toMatchObject({ status: 404 })
  })

  it('rejects suspension appeal acceptance from a non-admin staff member', async () => {
    const suspensionUser = await createTestUser()
    await suspendTestUserGetId(suspensionUser.id, 'Test suspension')
    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: 'I was suspended in error.',
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, suspensionUser, input)

    await deliverModerationAppealForTest(moderator.id, appeal.id)
    await expect(resolveModerationAppealAccept(moderator.id, appeal.id)).rejects.toMatchObject({
      status: 403,
    })
  })
})

async function probeAuthorLifecycleLock(userId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(`/* author lifecycle lock timeout */ SET LOCAL lock_timeout = '50ms'`)
  await lockAuthorPublicationLifecycle(query, userId)
  await query.commit()
}
