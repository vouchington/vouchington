import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestUserWarning,
  insertTestModerationReport,
  insertTestModerationAppeal,
  softDeleteUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { openOrGetOpenCase } from '@services/moderation-cases'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput } from './parse.mts'
import { getModerationAppealById, listModerationAppeals, getAppealCaseTrace } from './get.mts'
import { dismissModerationAppeal } from './dismiss-appeal.mts'
import { deliverModerationAppealForTest } from './resolution.test-helpers.mts'

describe('getModerationAppealById', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  it('returns appeal by id', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Testing get by ID.',
    })
    const { appeal: created } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)
    const fetched = await getModerationAppealById(created.id)

    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(created.id)
    expect(fetched!.status).toBe('pending')
  })

  it('returns null for unknown id', async () => {
    const result = await getModerationAppealById(crypto.randomUUID())
    expect(result).toBeNull()
  })

  it('keeps an appeal readable with durable actor fallback after appellant deletion', async () => {
    const deletedAppellant = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: deletedAppellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Durable deleted appellant fallback.',
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, deletedAppellant, input)
    await softDeleteUser(deletedAppellant.id)

    const fetched = await getModerationAppealById(appeal.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.staff_context?.appellant).toEqual({
      id: deletedAppellant.id,
      username: null,
      verified_display_name: null,
      profile_image_id: null,
    })
  })

  it('adds is_overdue=false for a freshly created appeal', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Checking overdue flag.',
    })
    const { appeal: created } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)
    const fetched = await getModerationAppealById(created.id)

    expect(fetched!.is_overdue).toBe(false)
  })

  it('does not set is_overdue for a resolved appeal', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Will be dismissed.',
    })
    const { appeal: created } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)
    await deliverModerationAppealForTest(staff.id, created.id)
    await dismissModerationAppeal(staff.id, created.id)
    const fetched = await getModerationAppealById(created.id)

    expect(fetched!.status).toBe('dismissed')
    expect(fetched!.is_overdue).toBeUndefined()
  })
})

describe('listModerationAppeals', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  async function createAppeal(reason: string) {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: reason,
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, appellant, input)
    return appeal
  }

  it('returns appeals by appellantUserId', async () => {
    const a1 = await createAppeal(`List test appeal ${crypto.randomUUID()}`)
    const a2 = await createAppeal(`List test appeal ${crypto.randomUUID()}`)

    const { appeals } = await listModerationAppeals({
      appellantUserId: appellant.id,
      status: 'pending',
    })

    const ids = appeals.map(a => a.id)
    expect(ids).toContain(a1.id)
    expect(ids).toContain(a2.id)
  })

  it('returns hasNextPage=true when there are more results', async () => {
    // Create 3 appeals for a unique appellant
    const uniqueAppellant = await createTestUser()
    for (let i = 0; i < 3; i++) {
      const warning = await insertTestUserWarning({
        userId: uniqueAppellant.id,
        issuedById: staff.id,
        reason: 'spam',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: `Pagination test ${i}`,
      })
      await createModerationAppeal(WEB_PROVENANCE, uniqueAppellant, input)
    }

    const { appeals, hasNextPage } = await listModerationAppeals({
      appellantUserId: uniqueAppellant.id,
      status: 'pending',
      limit: 2,
    })

    expect(appeals.length).toBe(2)
    expect(hasNextPage).toBe(true)
  })

  it('filters by status dismissed', async () => {
    const uniqueAppellant = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: uniqueAppellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Will be dismissed.',
    })
    const { appeal } = await createModerationAppeal(WEB_PROVENANCE, uniqueAppellant, input)
    await deliverModerationAppealForTest(staff.id, appeal.id)
    await dismissModerationAppeal(staff.id, appeal.id)

    const { appeals } = await listModerationAppeals({
      appellantUserId: uniqueAppellant.id,
      status: 'dismissed',
    })

    expect(appeals.some(a => a.id === appeal.id)).toBe(true)
  })
})

// Relocated from @services/moderation-cases/chain.test.mts (#6908 phase 3): moderation-cases
// must not depend on moderation-appeals, even in tests — the real dependency direction is
// moderation-appeals -> moderation-cases. getAppealCaseTrace is defined in ./get.mts, so its
// tests belong alongside the rest of this file's get.mts coverage.
describe('getAppealCaseTrace', () => {
  let reporter: PrivateUser
  let target: PrivateUser
  let staff: PrivateUser

  beforeAll(async () => {
    reporter = await createTestUser()
    target = await createTestUser()
    staff = await createTestUser({ extraRoles: ['staff'] })
  })

  it('returns trace containing the originating report', async () => {
    await openOrGetOpenCase({ entityType: 'user', entityId: target.id })

    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: target.id,
    })

    const warning = await insertTestUserWarning({
      userId: target.id,
      issuedById: staff.id,
      reason: 'Violation',
      reportId,
    })

    const appeal = await insertTestModerationAppeal({
      appellantId: target.id,
      userWarningId: warning.id,
    })

    const trace = await getAppealCaseTrace(appeal.id)

    expect(trace).not.toBeNull()
    expect(trace!.reports.some(r => r.id === reportId)).toBe(true)
  })

  it('returns null for unknown appeal id', async () => {
    const trace = await getAppealCaseTrace(crypto.randomUUID())
    expect(trace).toBeNull()
  })
})
