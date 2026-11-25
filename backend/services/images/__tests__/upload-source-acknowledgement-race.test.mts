import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { recordTestImageUploadSourceAcknowledgement } from '@voucha/test-helpers/entities/image-upload-state'
import { createOwnedStagedImage } from '@voucha/test-helpers/image-upload-cleanup-fixtures'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { markImageUploadSourceDeleted } from '../complete-upload-state.mts'
import { getImageByIdFromPrimary } from '../get.mts'

describe('image upload source acknowledgement', () => {
  it('keeps the first acknowledgement when a second transaction reaches the same image', async () => {
    const acknowledgedAt = new Date()
    const imageId = await createOwnedStagedImage(acknowledgedAt)
    await using first = await beginTransaction()
    await recordTestImageUploadSourceAcknowledgement(first, imageId, acknowledgedAt)

    await withTestOwnedPostgresWait(
      {
        holderProcessId: await getTestPostgresBackendProcessId(first),
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'markImageUploadSourcesDeleted:update',
        releaseHolder: () => first[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const second = markImageUploadSourceDeleted(imageId)
        await waitForLock(second)
        await first.commit()
        return second
      },
    )

    expect(await getImageByIdFromPrimary(imageId)).toMatchObject({
      upload_source_deleted_at: acknowledgedAt,
    })
  })
})
