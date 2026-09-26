import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestUserWarning,
  insertTestCommunityBan,
  insertTestCommunity,
  insertTestPost,
  suspendTestUserGetId,
  insertTestModerationAppeal,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { openOrGetOpenCase, findOpenCaseForEntity, resolveCase } from '@services/moderation-cases'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput } from './parse.mts'

describe('resolveAppealTarget — warning reopenCase branches', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  it('reopens the warning case when no newer case exists', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    await resolveCase(warning.case_id, staff.id)

    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'The warning was unjust.',
    })
    await createModerationAppeal(WEB_PROVENANCE, appellant, input)

    const openCase = await findOpenCaseForEntity({ entityType: 'user', entityId: appellant.id })
    expect(openCase?.id).toBe(warning.case_id)
  })

  it('uses the newer open case when the warning case is already resolved', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const caseA = warning.case_id
    await resolveCase(caseA, staff.id)

    const caseB = await openOrGetOpenCase({ entityType: 'user', entityId: appellant.id })

    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Using newer case.',
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)

    expect(appeal.case_id).toBe(caseB)
  })
})

describe('resolveAppealTarget — ban reopenCase branches', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  it('reopens the ban case when no newer case exists', async () => {
    const community = await insertTestCommunity({
      name: `Reopen Ban Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `reopen-ban-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: appellant.id,
      bannedById: staff.id,
      reason: 'Repeated violations',
    })
    await resolveCase(ban.case_id, staff.id)

    const input = parseCreateModerationAppealInput({
      target_type: 'ban',
      target_id: ban.id,
      appeal_reason: 'The ban was unjust.',
    })
    await createModerationAppeal(WEB_PROVENANCE, appellant, input)

    const openCase = await findOpenCaseForEntity({ entityType: 'user', entityId: appellant.id })
    expect(openCase?.id).toBe(ban.case_id)
  })

  it('uses the newer open case when the ban case is already resolved', async () => {
    const community = await insertTestCommunity({
      name: `Newer Case Ban Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `newer-case-ban-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: appellant.id,
      bannedById: staff.id,
      reason: 'Violations',
    })
    const caseA = ban.case_id
    await resolveCase(caseA, staff.id)

    const caseB = await openOrGetOpenCase({ entityType: 'user', entityId: appellant.id })

    const input = parseCreateModerationAppealInput({
      target_type: 'ban',
      target_id: ban.id,
      appeal_reason: 'Using newer case for ban.',
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)

    expect(appeal.case_id).toBe(caseB)
  })
})

describe('resolveAppealTarget — suspension', () => {
  let appellant: PrivateUser

  beforeAll(async () => {
    appellant = await createTestUser()
  })

  it('creates an appeal against the most recent active suspension', async () => {
    await suspendTestUserGetId(appellant.id, 'Test suspension reason')
    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: 'I was suspended in error.',
    })
    const { appeal, isDuplicate } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)

    expect(isDuplicate).toBe(false)
    expect(appeal.user_suspension_id).not.toBeNull()
    expect(appeal.user_warning_id).toBeNull()
    expect(appeal.community_ban_id).toBeNull()
    expect(appeal.post_id).toBeNull()
    expect(appeal.target_context).toMatchObject({
      type: 'suspension',
      id: appeal.user_suspension_id,
      reason: 'Test suspension reason',
    })
    expect(appeal.target_context?.type).toBe('suspension')
    if (appeal.target_context?.type !== 'suspension') {
      throw new Error('Expected suspension context')
    }
    expect(appeal.target_context.created_at).toEqual(expect.any(String))
    expect(appeal.staff_context).toBeDefined()
    expect(appeal.staff_context!.original_decision.actor).toBeNull()
  })

  it('returns isDuplicate=true when an open appeal already exists for the suspension', async () => {
    const suspensionId = await suspendTestUserGetId(appellant.id, 'Duplicate test')
    await insertTestModerationAppeal({ appellantId: appellant.id, userSuspensionId: suspensionId })

    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: 'Filing again.',
    })
    const { isDuplicate } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)
    expect(isDuplicate).toBe(true)
  })

  it('throws 404 when the user has no active suspension', async () => {
    const noSuspensionUser = await createTestUser()
    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: 'I have no suspension but am trying anyway.',
    })
    await expect(
      createModerationAppeal(WEB_PROVENANCE, noSuspensionUser, input),
    ).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('resolveAppealTarget — post removal reopenCase branch', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  it('reopens the post case when appealing a resolved post removal', async () => {
    const postId = await insertTestPost({
      title: `Reopen Post Case ${crypto.randomUUID().slice(0, 8)}`,
      slug: `reopen-post-case-${crypto.randomUUID().slice(0, 8)}`,
      createdById: appellant.id,
      markdown: 'Post content',
      clearanceStatus: 'rejected',
    })

    const caseId = await openOrGetOpenCase({ entityType: 'post', entityId: postId })
    await resolveCase(caseId, staff.id)

    const input = parseCreateModerationAppealInput({
      target_type: 'removal',
      target_id: postId,
      appeal_reason: 'My post was wrongly removed.',
    })
    await createModerationAppeal(WEB_PROVENANCE, appellant, input)

    const openCase = await findOpenCaseForEntity({ entityType: 'post', entityId: postId })
    expect(openCase?.id).toBe(caseId)
  })
})
