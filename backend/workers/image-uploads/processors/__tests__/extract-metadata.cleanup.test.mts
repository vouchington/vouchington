import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { randomBytes } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import { setImageHashAndProcessing } from '@voucha/test-helpers/entities/images'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { getImageById } from '@services/images/get'
import { deriveUploadStatus } from '@services/images/get-upload-state'
import type { PrivateUser } from '@services/users/types'
import {
  processExtractImageMetadata,
  type ProcessExtractImageMetadataDeps,
} from '../extract-metadata.mts'

describe('extract-metadata temporary-file lifecycle', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('does not finalize or enqueue when temporary-file cleanup fails', async () => {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
      dependencies: {
        presignImageUploadUrl: async () => 'https://images.example.test/fake-signature',
      },
    })
    await setImageHashAndProcessing(image_id, randomBytes(32))

    const cleanupError = new Error('temporary cleanup failed')
    const enqueueOnImageCreated = vi.fn<() => Promise<void>>(async () => undefined)
    const publishImageState = vi.fn<ProcessExtractImageMetadataDeps['publishImageState']>(
      async () => undefined,
    )
    const withTemporaryMediaFile = vi.fn<ProcessExtractImageMetadataDeps['withTemporaryMediaFile']>(
      async (_body, use) => {
        await use('/unused/image')
        throw cleanupError
      },
    )

    await expect(
      processExtractImageMetadata(image_id, {
        getImageFromS3: async () => ({
          $metadata: {},
          Body: Readable.from([Buffer.from('image')]) as never,
        }),
        getDeployEnvironment: () => 'test',
        createSharp: () => ({
          metadata: async () => ({ format: 'jpeg', width: 100, height: 100 }),
        }),
        enqueueOnImageCreated,
        publishImageState,
        withTemporaryMediaFile,
      }),
    ).rejects.toBe(cleanupError)

    const updated = await getImageById(image_id)
    expect(updated && deriveUploadStatus(updated)).toBe('failed')
    expect(enqueueOnImageCreated).not.toHaveBeenCalled()
    expect(publishImageState).not.toHaveBeenCalledWith(
      image_id,
      expect.objectContaining({ upload_status: 'complete' }),
    )
  })
})
