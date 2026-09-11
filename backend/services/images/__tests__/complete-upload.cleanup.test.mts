import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createImageUploadUrl } from '../create-upload-url.mts'
import { completeImageUpload } from '../complete-upload.mts'
import { getImageById } from '../get.mts'
import * as s3Module from '../s3-upload-lifecycle.mts'

describe('completeImageUpload temporary-file cleanup', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the durable processing handoff when temporary-file cleanup fails', async () => {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const sha256 = createHash('sha256').update(`cleanup ${image_id}`).digest()
    const cleanup = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('cleanup failed'))
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from(['ignored because the frozen file is injected']),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)
    vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()
    vi.spyOn(s3Module, 'promoteFrozenImageToS3').mockResolvedValue({
      created: true,
      s3Key: sha256.toString('hex'),
    })
    vi.spyOn(s3Module, 'ensureImageDeliveryAliasInS3').mockResolvedValue({
      created: true,
      s3Key: image_id,
    })

    await expect(
      completeImageUpload(user, image_id, {
        freezeImageUpload: async () => ({
          bytes: 1,
          cleanup,
          filename: '/unused/frozen-upload',
          sha256,
        }),
      }),
    ).resolves.toMatchObject({ id: image_id, s3_key: sha256.toString('hex') })

    expect(cleanup).toHaveBeenCalledOnce()
    expect((await getImageById(image_id))?.s3_key).toBe(sha256.toString('hex'))
  })
})
