import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  withForcedTransactionRollbackForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { EXPOSURE_BREAK_THRESHOLD } from '../config.mts'
import { recordMediaRevealAndGetExposureState } from '../record.mts'
import { getExposureState } from '../get.mts'

describe('recordMediaReveal', () => {
  let moderator: PrivateUser
  let postAuthor: PrivateUser

  beforeAll(async () => {
    moderator = await createTestUser()
    postAuthor = await createTestUser()
  })

  it('persists a reveal row (no postId / reportId)', async () => {
    const before = await getExposureState(moderator.id)
    const after = await recordMediaRevealAndGetExposureState(moderator.id, { surface: 'mod_queue' })
    expect(after.count).toBe(before.count + 1)
  })

  it('persists a reveal row with a valid postId', async () => {
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `exposure-record-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Exposure Record Post',
      markdown: 'body',
    })
    const before = await getExposureState(moderator.id)
    const after = await recordMediaRevealAndGetExposureState(moderator.id, {
      postId,
      surface: 'post_page',
    })
    expect(after.count).toBe(before.count + 1)
  })

  it('persists a reveal row with optional metadata', async () => {
    const before = await getExposureState(moderator.id)
    const after = await recordMediaRevealAndGetExposureState(moderator.id, {
      surface: 'reports',
      metadata: { source: 'test' },
    })
    expect(after.count).toBe(before.count + 1)
  })

  it('keeps a committed reveal when the caller transaction rolls back', async () => {
    const before = await getExposureState(moderator.id)

    await expect(
      withForcedTransactionRollbackForTest(async () => {
        await recordMediaRevealAndGetExposureState(moderator.id, { surface: 'mod_queue' })
      }),
    ).rejects.toThrow('Injected transaction rollback for test')

    expect((await getExposureState(moderator.id)).count).toBe(before.count + 1)
  })

  it('serializes concurrent reveals for one moderator through threshold evaluation', async () => {
    const concurrentModerator = await createTestUser()
    const states = await Promise.all(
      Array.from({ length: EXPOSURE_BREAK_THRESHOLD }, () =>
        recordMediaRevealAndGetExposureState(concurrentModerator.id, {
          surface: 'mod_queue',
        }),
      ),
    )

    expect(states.map(state => state.count).toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: EXPOSURE_BREAK_THRESHOLD }, (_, index) => index + 1),
    )
    expect(states.filter(state => state.in_cooldown)).toHaveLength(1)
  })
})
