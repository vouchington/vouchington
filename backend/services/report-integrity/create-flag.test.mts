import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUserDirect,
  getTestReportIntegrityFlagsByUserId,
  getTestReportIntegrityFlagsByPostId,
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

    const flag = await createReportIntegrityFlag('user', targetUser.id, 5, 0.8, {
      reporter_user_ids: [],
    })

    expect(flag).not.toBeNull()
    expect(flag!.reported_user_id).toBe(targetUser.id)
    expect(flag!.flag_type).toBe('mass_report_suspected')
    expect(flag!.reporter_count).toBe(5)
    expect(flag!.new_account_reporter_pct).toBeCloseTo(0.8)
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

    const flag = await createReportIntegrityFlag('post', postId, 6, 0.5, {
      reporter_user_ids: [],
    })

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

    const flag = await createReportIntegrityFlag('comment', postId, 5, 0.6, {
      reporter_user_ids: [],
    })

    expect(flag).not.toBeNull()
    expect(flag!.post_id).toBe(postId)
    expect(flag!.reported_user_id).toBeNull()
  }, 60_000)

  it('returns null on duplicate pending flag for same entity (ON CONFLICT DO NOTHING)', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })

    const flag1 = await createReportIntegrityFlag('user', targetUser.id, 5, 0.8, {
      reporter_user_ids: [],
    })
    expect(flag1).not.toBeNull()

    const flag2 = await createReportIntegrityFlag('user', targetUser.id, 6, 0.9, {
      reporter_user_ids: [],
    })
    expect(flag2).toBeNull()
  }, 60_000)

  it('throws 400 for unknown entity type', async () => {
    const fakeId = uuidv7()
    await expect(createReportIntegrityFlag('unknown_type', fakeId, 5, 0.8, {})).rejects.toThrow(
      'Unknown entity type: unknown_type',
    )
  }, 60_000)
})
