import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestUserWarning,
  insertTestModerationAppeal,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { openOrGetOpenCase, findOpenCaseForEntity } from './open.mts'
import { resolveCase, maybeResolveCase, maybeResolveCases, reopenCase } from './resolve.mts'

describe('resolveCase', () => {
  it('marks a case as resolved', async () => {
    const user = await createTestUser()
    const staff = await createTestUser({ extraRoles: ['staff'] })

    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: user.id })
    await resolveCase(caseId, staff.id)

    const found = await findOpenCaseForEntity({ entityType: 'user', entityId: user.id })
    expect(found).toBeNull()
  })

  it('is idempotent — resolving twice does not throw', async () => {
    const user = await createTestUser()
    const staff = await createTestUser({ extraRoles: ['staff'] })

    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: user.id })
    await resolveCase(caseId, staff.id)
    await expect(resolveCase(caseId, staff.id)).resolves.toBeUndefined()
  })

  it('allows system resolution with null resolvedById', async () => {
    const user = await createTestUser()
    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: user.id })
    await expect(resolveCase(caseId, null)).resolves.toBeUndefined()
  })
})

describe('reopenCase', () => {
  it('re-opens a previously resolved case', async () => {
    const user = await createTestUser()
    const staff = await createTestUser({ extraRoles: ['staff'] })

    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: user.id })
    await resolveCase(caseId, staff.id)

    const closed = await findOpenCaseForEntity({ entityType: 'user', entityId: user.id })
    expect(closed).toBeNull()

    await reopenCase(caseId)

    const reopened = await findOpenCaseForEntity({ entityType: 'user', entityId: user.id })
    expect(reopened?.id).toBe(caseId)
  })
})

describe('maybeResolveCase', () => {
  let reporter: PrivateUser
  let staff: PrivateUser

  beforeAll(async () => {
    reporter = await createTestUser()
    staff = await createTestUser({ extraRoles: ['staff'] })
  })

  it('resolves multiple eligible cases while leaving a case with a pending child open', async () => {
    const [eligibleTarget, pendingTarget] = await Promise.all([createTestUser(), createTestUser()])
    const eligibleCaseId = await openOrGetOpenCase({
      entityType: 'user',
      entityId: eligibleTarget!.id,
    })
    const pendingCaseId = await openOrGetOpenCase({
      entityType: 'user',
      entityId: pendingTarget!.id,
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: pendingTarget!.id,
    })

    await maybeResolveCases([eligibleCaseId, pendingCaseId], staff.id)

    await expect(
      findOpenCaseForEntity({ entityType: 'user', entityId: eligibleTarget!.id }),
    ).resolves.toBeNull()
    await expect(
      findOpenCaseForEntity({ entityType: 'user', entityId: pendingTarget!.id }),
    ).resolves.toMatchObject({ id: pendingCaseId })
  })

  it('does not resolve when there are pending reports', async () => {
    const target = await createTestUser()
    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: target.id })

    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: target.id,
    })

    await maybeResolveCase(caseId, staff.id)

    const found = await findOpenCaseForEntity({ entityType: 'user', entityId: target.id })
    expect(found?.id).toBe(caseId)
  })

  it('does not resolve when there is a pending appeal', async () => {
    const target = await createTestUser()
    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: target.id })

    const warning = await insertTestUserWarning({
      userId: target.id,
      issuedById: staff.id,
    })
    await insertTestModerationAppeal({
      appellantId: target.id,
      userWarningId: warning.id,
    })

    await maybeResolveCase(caseId, staff.id)

    const found = await findOpenCaseForEntity({ entityType: 'user', entityId: target.id })
    expect(found?.id).toBe(caseId)
  })

  it('resolves when there are no pending reports or appeals', async () => {
    const target = await createTestUser()
    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: target.id })

    await maybeResolveCase(caseId, staff.id)

    const found = await findOpenCaseForEntity({ entityType: 'user', entityId: target.id })
    expect(found).toBeNull()
  })
})
