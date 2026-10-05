import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUserDirect,
  getTestReportIntegrityFlagReporterIds,
  getTestReportIntegrityFlagsByUserId,
  getTestReportIntegrityFlagsByPostId,
  getTestReportIntegrityFlagStoredDetails,
  insertTestPost,
} from '@voucha/test-helpers'
import { createReportIntegrityFlag } from './create-flag.mts'
import type { PrivateUser } from '@services/users/types'

describe('createReportIntegrityFlag', () => {
  const randomUsername = () => `test-ri-cf-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-ri-cf-${randomBytes(6).toString('hex')}`

  let creatorUser: PrivateUser

  beforeAll(async () => {
    creatorUser = await createTestUserDirect({ username: randomUsername() })
  }, 60_000)

  it('inserts a flag for a user entity and returns it', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })

    const flag = await createReportIntegrityFlag('user', targetUser.id, 5, 0.8, {}, [])

    expect(flag).not.toBeNull()
    expect(flag!.reported_user_id).toBe(targetUser.id)
    expect(flag!.flag_type).toBe('mass_report_suspected')
    expect(flag!.reporter_count).toBe(5)
    expect(flag!.new_account_reporter_percent).toBeCloseTo(0.8)
    expect(flag!.resolved_at).toBeNull()

    const dbFlags = await getTestReportIntegrityFlagsByUserId(targetUser.id)
    expect(dbFlags.some(f => f.id === flag!.id)).toBe(true)
  }, 60_000)

  it('inserts a flag for a post entity and returns it', async () => {
    const slug = randomSlug()
    const postId = await insertTestPost({
      title: `Create Flag Test ${slug}`,
      slug,
      createdById: creatorUser.id,
      markdown: 'test',
    })

    const flag = await createReportIntegrityFlag('post', postId, 6, 0.5, {}, [])

    expect(flag).not.toBeNull()
    expect(flag!.post_id).toBe(postId)
    expect(flag!.reported_user_id).toBeNull()

    const dbFlags = await getTestReportIntegrityFlagsByPostId(postId)
    expect(dbFlags.some(f => f.id === flag!.id)).toBe(true)
  }, 60_000)

  it('maps comment entity type to post_id (same as post)', async () => {
    const slug = randomSlug()
    const postId = await insertTestPost({
      title: `Create Flag Comment Test ${slug}`,
      slug,
      createdById: creatorUser.id,
      markdown: 'test',
    })

    const flag = await createReportIntegrityFlag('comment', postId, 5, 0.6, {}, [])

    expect(flag).not.toBeNull()
    expect(flag!.post_id).toBe(postId)
    expect(flag!.reported_user_id).toBeNull()
  }, 60_000)

  it('returns null on duplicate pending flag for same entity (ON CONFLICT DO NOTHING)', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })

    const reporter = await createTestUserDirect({ username: randomUsername() })
    const laterReporter = await createTestUserDirect({ username: randomUsername() })

    const flag1 = await createReportIntegrityFlag('user', targetUser.id, 5, 0.8, {}, [reporter.id])
    expect(flag1).not.toBeNull()

    const flag2 = await createReportIntegrityFlag('user', targetUser.id, 6, 0.9, {}, [
      laterReporter.id,
    ])
    expect(flag2).toBeNull()
    await expect(getTestReportIntegrityFlagReporterIds(flag1!.id)).resolves.toEqual([reporter.id])
  }, 60_000)

  it('stores each reporter once as a row and rebuilds them into details', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporters = await Promise.all(
      [1, 2, 3].map(() => createTestUserDirect({ username: randomUsername() })),
    )
    const reporterIds = reporters.map(reporter => reporter.id).toSorted()

    const flag = await createReportIntegrityFlag(
      'user',
      targetUser.id,
      3,
      0.4,
      { window_minutes: 60 },
      [...reporterIds, reporterIds[0]!],
    )

    expect(flag!.details).toEqual({ window_minutes: 60, reporter_user_ids: reporterIds })
    await expect(getTestReportIntegrityFlagReporterIds(flag!.id)).resolves.toEqual(reporterIds)
    await expect(getTestReportIntegrityFlagStoredDetails(flag!.id)).resolves.toEqual({
      window_minutes: 60,
    })
  }, 60_000)

  it('skips reporters whose accounts no longer exist', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporter = await createTestUserDirect({ username: randomUsername() })
    const missingReporterId = uuidv7()

    const flag = await createReportIntegrityFlag('user', targetUser.id, 2, 0.5, {}, [
      reporter.id,
      missingReporterId,
    ])

    expect(flag!.details.reporter_user_ids).toEqual([reporter.id])
    await expect(getTestReportIntegrityFlagReporterIds(flag!.id)).resolves.toEqual([reporter.id])
  }, 60_000)

  it('throws 400 for unknown entity type', async () => {
    const fakeId = uuidv7()
    await expect(createReportIntegrityFlag('unknown_type', fakeId, 5, 0.8, {}, [])).rejects.toThrow(
      'Unknown entity type: unknown_type',
    )
  }, 60_000)
})
