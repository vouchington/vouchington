import { describe, it, expect, beforeAll, vi } from 'vitest'
import { randomBytes, createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { markImageUploadFailed } from '../upload-state.mts'
import { getImageByIdFromPrimary } from '../get.mts'
import {
  createTestUser,
  insertPendingTestImage,
  updateImageStatus,
  markImageComplete,
} from '@voucha/test-helpers'
import { completeImageUpload } from '../complete-upload.mts'
import { deriveUploadStatus } from '../get-upload-state.mts'
import assert from 'node:assert'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('completeImageUpload', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('should return 404 for non-existent image', async () => {
    await expect(
      completeImageUpload(user, '01936f8e-8b2a-7890-a456-123456789012'),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('should return 403 if user does not own the upload', async () => {
    const user1 = await createTestUser()
    assert(user1)
    const user2 = await createTestUser()
    assert(user2)
    const image_id = await insertPendingTestImage(user1.id)

    await expect(completeImageUpload(user2, image_id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('should return 409 if already processing', async () => {
    const image_id = await insertPendingTestImage(user.id)

    // Manually set to processing
    await updateImageStatus(image_id, 'processing')

    await expect(completeImageUpload(user, image_id)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('should return existing image if already complete', async () => {
    const image_id = await insertPendingTestImage(user.id)

    // Manually set to complete with a valid hash
    await markImageComplete(image_id)

    const result = await completeImageUpload(user, image_id)
    expect(deriveUploadStatus(result)).toBe('complete')
    expect(result.id).toBe(image_id)
  })

  it('should reject with 400 for invalid status', async () => {
    const image_id = await insertPendingTestImage(user.id)

    // Manually set to failed
    await updateImageStatus(image_id, 'failed')

    await expect(completeImageUpload(user, image_id)).rejects.toMatchObject({
      status: 400,
    })
  })

  it('preserves the promotion rejection when reading terminal state for cleanup fails', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const bytes = randomBytes(64)
    const digest = createHash('sha256').update(bytes).digest('hex')
    const originalSend = S3Client.prototype.send
    const send = vi.fn<VitestLooseMock>(async function (this: S3Client, command: unknown) {
      if (command instanceof GetObjectCommand && command.input.Key === imageId) {
        return { $metadata: {}, Body: Readable.from([bytes]), ContentType: 'image/png' }
      }
      if (
        command instanceof PutObjectCommand &&
        (command.input.Key === imageId || command.input.Key === digest)
      ) {
        expect(command.input.Body).toBeInstanceOf(Readable)
        for await (const chunk of command.input.Body as Readable) {
          expect(Buffer.from(chunk)).toEqual(bytes)
        }
        if (command.input.Key === digest)
          await markImageUploadFailed(imageId, 'Owned terminal failure during promotion')
        return { $metadata: {} }
      }
      return Reflect.apply(originalSend, this, [command])
    })
    const sendSpy = vi.spyOn(S3Client.prototype, 'send').mockImplementation(send)
    try {
      const { result, error } = await withPostgresPoolQueryFailureForTest(
        '/* getImageByIdFromPrimary */',
        () => completeImageUpload(user, imageId).catch((err: unknown) => err),
        { command: 'SELECT' },
      )
      expect(error).toMatchObject({ code: '25P02' })
      expect(result).toMatchObject({
        status: 409,
        message: 'Image upload is no longer eligible for promotion',
      })
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, expect.anything())
      await expect(getImageByIdFromPrimary(imageId, true)).resolves.toMatchObject({
        upload_completed_at: null,
        upload_failed_at: expect.any(Date),
        upload_error: 'Owned terminal failure during promotion',
      })
    } finally {
      sendSpy.mockRestore()
    }
  })
})
