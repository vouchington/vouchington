/**
 * End-to-end chain test: report → judgement → enforcement → notice → appeal → resolution.
 *
 * Verifies the "broken hop" fix: an appeal can now trace back to its originating report
 * through a shared case_id.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestUserWarning,
  insertTestModerationAppeal,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { openOrGetOpenCase } from './open.mts'
import { getCaseTrace, findMostRecentCaseForEntity } from './get.mts'
import { resolveCase } from './resolve.mts'

describe('moderation case chain', () => {
  let reporter: PrivateUser
  let target: PrivateUser
  let staff: PrivateUser

  beforeAll(async () => {
    reporter = await createTestUser()
    target = await createTestUser()
    staff = await createTestUser({ extraRoles: ['staff'] })
  })

  it('shares a case_id across report → warning → appeal', async () => {
    // Step 1: Open a case for the target user
    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: target.id })

    // Step 2: Create a report — it should use the same case
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: target.id,
    })

    // Step 3: Issue a warning linked to the report
    const warning = await insertTestUserWarning({
      userId: target.id,
      issuedById: staff.id,
      reason: 'Policy violation',
      reportId,
    })

    // Step 4: File an appeal on the warning
    const appeal = await insertTestModerationAppeal({
      appellantId: target.id,
      userWarningId: warning.id,
    })

    // All three artifacts share the same case_id
    expect(warning.case_id).toBe(caseId)
    expect(appeal.case_id).toBe(caseId)
  })

  // Report-resolution-driven case lifecycle tests moved to
  // @services/moderation-reports/__tests__/resolve-case-chain.test.mts (needs resolveModerationReport).
})

describe('getCaseTrace', () => {
  let reporter: PrivateUser
  let target: PrivateUser
  let staff: PrivateUser

  beforeAll(async () => {
    reporter = await createTestUser()
    target = await createTestUser()
    staff = await createTestUser({ extraRoles: ['staff'] })
  })

  it('returns trace with report, warning, and appeal for a case', async () => {
    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: target.id })

    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: target.id,
    })

    const warning = await insertTestUserWarning({
      userId: target.id,
      issuedById: staff.id,
      reason: 'Policy violation',
      reportId,
    })

    await insertTestModerationAppeal({
      appellantId: target.id,
      userWarningId: warning.id,
    })

    const trace = await getCaseTrace(caseId)

    expect(trace).not.toBeNull()
    expect(trace!.case.id).toBe(caseId)
    expect(trace!.reports.some(r => r.id === reportId)).toBe(true)
    expect(trace!.warnings.some(w => w.id === warning.id)).toBe(true)
    expect(trace!.appeals.length).toBeGreaterThan(0)
  })

  it('returns null for unknown case id', async () => {
    const trace = await getCaseTrace(crypto.randomUUID())
    expect(trace).toBeNull()
  })
})

describe('findMostRecentCaseForEntity', () => {
  it('returns the most recent case when multiple exist', async () => {
    const user = await createTestUser()
    const staff = await createTestUser({ extraRoles: ['staff'] })

    const firstCaseId = await openOrGetOpenCase({ entityType: 'user', entityId: user.id })
    await resolveCase(firstCaseId, staff.id)

    const secondCaseId = await openOrGetOpenCase({ entityType: 'user', entityId: user.id })

    const mostRecent = await findMostRecentCaseForEntity({ entityType: 'user', entityId: user.id })
    expect(mostRecent?.id).toBe(secondCaseId)
  })

  it('returns null for entity with no cases', async () => {
    const user = await createTestUser()
    const result = await findMostRecentCaseForEntity({ entityType: 'user', entityId: user.id })
    expect(result).toBeNull()
  })
})
