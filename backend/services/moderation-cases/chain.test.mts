/** Case identity across report, warning, and appeal writes, plus recent-case lookup. */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestUserWarning,
  insertTestModerationAppeal,
} from '@voucha/test-helpers'
import { resolveTestModerationCase } from '@voucha/test-helpers/entities/moderation-case-reads'
import type { PrivateUser } from '@voucha/types/entities/user'
import { openOrGetOpenCase } from './open.mts'
import { findMostRecentCaseForEntity } from './get.mts'

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

describe('findMostRecentCaseForEntity', () => {
  it('returns the most recent case when multiple exist', async () => {
    const user = await createTestUser()
    const staff = await createTestUser({ extraRoles: ['staff'] })

    const firstCaseId = await openOrGetOpenCase({ entityType: 'user', entityId: user.id })
    await resolveTestModerationCase(firstCaseId, staff.id)

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
