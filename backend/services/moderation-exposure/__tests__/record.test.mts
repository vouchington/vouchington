import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  withForcedTransactionRollbackForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { EXPOSURE_BREAK_THRESHOLD } from '../config.mts'
import { recordMediaReveal, recordMediaRevealAndGetExposureState } from '../record.mts'
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
    await recordMediaReveal(moderator.id, { surface: 'mod_queue' })
    const after = await getExposureState(moderator.id)
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
    await recordMediaReveal(moderator.id, { postId, surface: 'post_page' })
    const after = await getExposureState(moderator.id)
    expect(after.count).toBe(before.count + 1)
  })

  it('persists a reveal row with optional metadata', async () => {
    const before = await getExposureState(moderator.id)
    await recordMediaReveal(moderator.id, {
      surface: 'reports',
      metadata: { source: 'test' },
    })
    const after = await getExposureState(moderator.id)
    expect(after.count).toBe(before.count + 1)
  })

  it('reads a reveal through the transaction that recorded it', async () => {
    const before = await getExposureState(moderator.id)

    await expect(
      withForcedTransactionRollbackForTest(async options => {
        await recordMediaReveal(moderator.id, { surface: 'mod_queue' }, options)
        const during = await getExposureState(moderator.id, options)
        expect(during.count).toBe(before.count + 1)
      }),
    ).rejects.toThrow('Injected transaction rollback for test')

    expect((await getExposureState(moderator.id)).count).toBe(before.count)
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

    expect(states.map(state => state.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: EXPOSURE_BREAK_THRESHOLD }, (_, index) => index + 1),
    )
    expect(states.filter(state => state.in_cooldown)).toHaveLength(1)
  })
})
