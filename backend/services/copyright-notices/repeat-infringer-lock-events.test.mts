import { describe, expect, it } from 'vitest'
import {
  exerciseTestCopyrightOwnedLockNotice,
  exerciseTestCopyrightSuppressedLockNotice,
  exerciseTestCopyrightForeignLockNotice,
} from '@voucha/test-helpers/copyright-author-lock-controls'

describe('owned copyright author-lock notices', () => {
  it('binds the blocked action to its actual backend and joins it after releasing the holder', async () => {
    const result = await exerciseTestCopyrightOwnedLockNotice()
    expect(result.beforePid).toBeGreaterThan(0)
    expect(result.afterPid).toBe(result.beforePid)
  })

  it('fails with the genuine bounded SQL cancellation when its session emits no lock-wait notice', async () => {
    await expect(exerciseTestCopyrightSuppressedLockNotice()).rejects.toMatchObject({
      code: '57014',
    })
  })

  it('does not accept a real wait notice for a different author lock', async () => {
    await expect(exerciseTestCopyrightForeignLockNotice()).rejects.toMatchObject({ code: '57014' })
  })
})
