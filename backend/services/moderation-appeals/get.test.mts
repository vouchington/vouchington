import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestModerationAppeal,
  insertTestUserWarning,
  softDeleteUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { observeTestPostgresQueryPools } from '@voucha/test-helpers/postgres-query-pool-observer'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput } from './parse.mts'
import {
  getModerationAppealById,
  getModerationAppealByIdFromPrimary,
  listModerationAppeals,
} from './get.mts'
import { APPEAL_SLA_HOURS } from './config.mts'
import { dismissModerationAppeal } from './dismiss-appeal.mts'
import { resolveModerationAppealReduce } from './resolve.mts'
import { deliverModerationAppealForTest } from '@voucha/test-helpers/services/moderation-appeals/resolution.fixtures'

describe('getModerationAppealById', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  it('rejects an unknown runtime list status before reading appeals', async () => {
    await expect(listModerationAppeals({ status: 'unknown' as 'pending' })).rejects.toThrow(
      'Unknown moderation appeal status',
    )
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
    const { appeal: created } = await createModerationAppeal(appellant, WEB_PROVENANCE, input)
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
    const { appeal } = await createModerationAppeal(deletedAppellant, WEB_PROVENANCE, input)
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
    const { appeal: created } = await createModerationAppeal(appellant, WEB_PROVENANCE, input)
    const fetched = await getModerationAppealById(created.id, created.created_at)

    expect(fetched!.is_overdue).toBe(false)
  })

  it('uses the observed UTC clock across appeal reads at the strict SLA cutoff', async () => {
    const owner = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: owner.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const calendarNow = new Date()
    const cutoff = new Date(
      Date.UTC(calendarNow.getUTCFullYear(), calendarNow.getUTCMonth(), 0, 23, 59, 59, 999),
    )
    const nextMonth = new Date(cutoff.getTime() + 1)
    const createdAt = new Date(cutoff.getTime() - APPEAL_SLA_HOURS * 3_600_000)
    const appeal = await insertTestModerationAppeal({
      appellantId: owner.id,
      userWarningId: warning.id,
      createdAt,
    })

    const ordinary = await observeTestPostgresQueryPools('/* getModerationAppealById */', () =>
      getModerationAppealById(appeal.id, cutoff),
    )
    expect(ordinary.pools).toEqual(['read'])
    expect(ordinary.result?.is_overdue).toBe(false)

    const primary = await observeTestPostgresQueryPools('/* getModerationAppealById */', () =>
      getModerationAppealByIdFromPrimary(appeal.id, { readOnly: true }, nextMonth),
    )
    expect(primary.pools).toEqual(['write'])
    expect(primary.result?.is_overdue).toBe(true)

    const atCutoff = await listModerationAppeals({ appellantUserId: owner.id, now: cutoff })
    const afterCutoff = await listModerationAppeals({ appellantUserId: owner.id, now: nextMonth })
    expect(atCutoff.appeals).toContainEqual(
      expect.objectContaining({ id: appeal.id, is_overdue: false }),
    )
    expect(afterCutoff.appeals).toContainEqual(
      expect.objectContaining({ id: appeal.id, is_overdue: true }),
    )
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
    const { appeal: created } = await createModerationAppeal(appellant, WEB_PROVENANCE, input)
    await deliverModerationAppealForTest(staff.id, created.id)
    await dismissModerationAppeal(staff.id, created.id, 'staff_or_user')
    const observedAt = new Date(created.created_at.getTime() + APPEAL_SLA_HOURS * 3_600_000 + 1)
    const fetched = await getModerationAppealById(created.id, observedAt)

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

  async function createAppeal(reason: string, target = appellant) {
    const warning = await insertTestUserWarning({
      userId: target.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: reason,
    })
    const { appeal } = await createModerationAppeal(target, WEB_PROVENANCE, input)
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
      await createModerationAppeal(uniqueAppellant, WEB_PROVENANCE, input)
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
    const { appeal } = await createModerationAppeal(uniqueAppellant, WEB_PROVENANCE, input)
    await deliverModerationAppealForTest(staff.id, appeal.id)
    await dismissModerationAppeal(staff.id, appeal.id, 'staff_or_user')

    const { appeals } = await listModerationAppeals({
      appellantUserId: uniqueAppellant.id,
      status: 'dismissed',
    })

    expect(appeals.some(a => a.id === appeal.id)).toBe(true)
  })

  it('filters resolved appeals and pages strictly before the cursor', async () => {
    const uniqueAppellant = await createTestUser()
    const first = await createAppeal('First resolved appeal', uniqueAppellant)
    const second = await createAppeal('Second resolved appeal', uniqueAppellant)
    await createAppeal('Pending appeal', uniqueAppellant)

    for (const appeal of [first, second]) {
      await deliverModerationAppealForTest(staff.id, appeal.id)
      await resolveModerationAppealReduce(staff.id, appeal.id, 'staff_or_user')
    }

    const [older, newer] = [first.id, second.id].toSorted()
    const options = { appellantUserId: uniqueAppellant.id, status: 'resolved' as const }
    const all = await listModerationAppeals(options)
    expect(all.appeals.map(appeal => appeal.id)).toEqual([newer, older])
    const page = await listModerationAppeals({ ...options, beforeId: newer })
    expect(page.appeals.map(appeal => appeal.id)).toEqual([older])
  })
})
