import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestUserWarning,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createModerationAppeal } from './create.mts'
import { dismissModerationAppeal } from './dismiss-appeal.mts'
import { parseCreateModerationAppealInput } from './parse.mts'
import { deliverModerationAppealForTest } from './resolution.test-helpers.mts'
import { resolveModerationAppealAccept, resolveModerationAppealReduce } from './resolve.mts'

describe('moderation appeal delivery requirement', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  async function createWarningAppeal() {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const { appeal } = await createModerationAppeal(
      WEB_PROVENANCE,
      appellant,
      parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: `Delivery lifecycle ${crypto.randomUUID()}`,
      }),
    )
    return appeal
  }

  async function createDeliveredWarningAppeal() {
    const appeal = await createWarningAppeal()
    await deliverModerationAppealForTest(staff.id, appeal.id)
    return appeal
  }

  it('rejects accept before delivery', async () => {
    const appeal = await createWarningAppeal()
    await expect(resolveModerationAppealAccept(staff.id, appeal.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('rejects reduce before delivery', async () => {
    const appeal = await createWarningAppeal()
    await expect(resolveModerationAppealReduce(staff.id, appeal.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('rejects deny before delivery', async () => {
    const appeal = await createWarningAppeal()
    await expect(dismissModerationAppeal(staff.id, appeal.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('reduces a delivered appeal and rejects a second resolution', async () => {
    const appeal = await createDeliveredWarningAppeal()
    const resolved = await resolveModerationAppealReduce(staff.id, appeal.id)

    expect(resolved).toMatchObject({
      status: 'resolved',
      resolution_action: 'reduce',
      resolved_by_id: staff.id,
    })
    expect(resolved.resolved_at).not.toBeNull()
    expect(resolved.created_at).toBeInstanceOf(Date)
    await expect(resolveModerationAppealReduce(staff.id, appeal.id)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('denies a delivered appeal and rejects a second resolution', async () => {
    const appeal = await createDeliveredWarningAppeal()
    const dismissed = await dismissModerationAppeal(staff.id, appeal.id)

    expect(dismissed).toMatchObject({
      status: 'dismissed',
      resolution_action: 'deny',
      resolved_by_id: staff.id,
    })
    expect(dismissed.resolved_at).not.toBeNull()
    expect(dismissed.created_at).toBeInstanceOf(Date)
    await expect(dismissModerationAppeal(staff.id, appeal.id)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('denies a delivered community-ban appeal', async () => {
    const community = await insertTestCommunity({
      name: `Delivery Ban ${crypto.randomUUID().slice(0, 8)}`,
      slug: `delivery-ban-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: appellant.id,
      bannedById: staff.id,
      reason: 'Violations',
    })
    const { appeal } = await createModerationAppeal(
      WEB_PROVENANCE,
      appellant,
      parseCreateModerationAppealInput({
        target_type: 'ban',
        target_id: ban.id,
        appeal_reason: `Delivery ban ${crypto.randomUUID()}`,
      }),
    )
    await deliverModerationAppealForTest(staff.id, appeal.id)

    await expect(dismissModerationAppeal(staff.id, appeal.id)).resolves.toMatchObject({
      status: 'dismissed',
    })
  })
})
