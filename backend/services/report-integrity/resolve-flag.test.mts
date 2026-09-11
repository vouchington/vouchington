import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserDirect, insertTestReportIntegrityFlag } from '@voucha/test-helpers'
import { resolveReportIntegrityFlag } from './resolve-flag.mts'
import type { PrivateUser } from '@services/users/types'
import type { ReportIntegrityPatchResolution } from '@ts-shared/utils/moderation-catalogs'

describe('resolveReportIntegrityFlag', () => {
  const randomUsername = () => `test-ri-rf-${randomBytes(4).toString('hex')}`

  let adminUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUserDirect({ username: randomUsername() })
  }, 60_000)

  it('accepts only the non-penalty PATCH resolution at the service boundary', () => {
    expectTypeOf(resolveReportIntegrityFlag)
      .parameter(2)
      .toEqualTypeOf<ReportIntegrityPatchResolution>()
  })

  it('sets resolved_at, resolved_by_id, and resolution on a pending flag', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterCount: 5,
    })

    const resolved = await resolveReportIntegrityFlag(flagId, adminUser.id, 'dismissed')

    expect(resolved.id).toBe(flagId)
    expect(resolved.resolved_at).not.toBeNull()
    expect(resolved.resolved_by_id).toBe(adminUser.id)
    expect(resolved.resolution).toBe('dismissed')
  }, 60_000)

  it('throws 404 when resolving an already-resolved flag', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterCount: 5,
      resolvedAt: new Date(),
      resolution: 'dismissed',
    })

    await expect(resolveReportIntegrityFlag(flagId, adminUser.id, 'dismissed')).rejects.toThrow(
      'Report integrity flag not found or already resolved',
    )
  }, 60_000)

  it('throws 404 for a completely unknown flag ID', async () => {
    await expect(resolveReportIntegrityFlag(uuidv7(), adminUser.id, 'dismissed')).rejects.toThrow(
      'Report integrity flag not found or already resolved',
    )
  }, 60_000)
})
