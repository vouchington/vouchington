import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { processAuthorDeletionPublicationBatch } from './capture-author-deletion-batch.mts'

describe('processAuthorDeletionPublicationBatch', () => {
  it('waits for a concurrent profile username update before retaining the tombstone', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')

    await using profileUpdate = await beginTransaction()
    await profileUpdate(
      `/* update profile username */ UPDATE users SET username = username WHERE id = $1`,
      [user.id],
    )
    await expect(captureAuthorDeletionWithShortTimeout(user.id)).rejects.toMatchObject({
      code: '55P03',
    })
    await profileUpdate.commit()
  })
})

async function captureAuthorDeletionWithShortTimeout(userId: string): Promise<void> {
  await using capture = await beginTransaction()
  await capture(`/* author deletion username lock timeout */ SET LOCAL lock_timeout = '50ms'`)
  await processAuthorDeletionPublicationBatch(capture, userId, null, 100)
  await capture.commit()
}
