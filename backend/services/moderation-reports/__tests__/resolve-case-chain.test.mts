/**
 * Verifies that resolving reports drives moderation case lifecycle transitions:
 * a case stays open while any of its reports are pending, and closing the last
 * pending report allows a fresh case to be opened afterward.
 *
 * Moved from @services/moderation-cases/chain.test.mts: these tests need
 * resolveModerationReport (this package), while @services/moderation-cases
 * only depends on this package's runtime code in the other, real direction.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { createTestUser, insertTestModerationReport } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { openOrGetOpenCase, findOpenCaseForEntity, getCaseById } from '@services/moderation-cases'
import { resolveModerationReport } from '../resolve.mts'

describe('moderation case chain (report resolution)', () => {
  let reporter: PrivateUser
  let reporter2: PrivateUser
  let staff: PrivateUser

  beforeAll(async () => {
    reporter = await createTestUser()
    reporter2 = await createTestUser()
    staff = await createTestUser({ extraRoles: ['staff'] })
  })

  it('case does not resolve while pending reports exist', async () => {
    const localTarget = await createTestUser()
    const localCaseId = await openOrGetOpenCase({ entityType: 'user', entityId: localTarget.id })

    const reportId1 = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: localTarget.id,
    })
    const reportId2 = await insertTestModerationReport({
      reporterUserId: reporter2.id,
      entityType: 'user',
      entityId: localTarget.id,
    })

    // Resolve only one of two pending reports — case must remain open
    await resolveModerationReport(reportId1, { resolvedById: staff.id, status: 'reviewed' })

    const openCase = await findOpenCaseForEntity({ entityType: 'user', entityId: localTarget.id })
    expect(openCase?.id).toBe(localCaseId)

    // Resolve the second report — case should now close
    await resolveModerationReport(reportId2, { resolvedById: staff.id, status: 'dismissed' })

    const closedCase = await findOpenCaseForEntity({ entityType: 'user', entityId: localTarget.id })
    expect(closedCase).toBeNull()
  })

  it('new open case can be created after the previous case is resolved', async () => {
    const localTarget = await createTestUser()
    const firstCaseId = await openOrGetOpenCase({ entityType: 'user', entityId: localTarget.id })

    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: localTarget.id,
    })
    await resolveModerationReport(reportId, { resolvedById: staff.id, status: 'reviewed' })

    // First case should now be closed
    const firstCase = await getCaseById(firstCaseId)
    expect(firstCase?.resolved_at).not.toBeNull()

    // Opening a new case should create a fresh one
    const secondCaseId = await openOrGetOpenCase({ entityType: 'user', entityId: localTarget.id })
    expect(secondCaseId).not.toBe(firstCaseId)
  })
})
