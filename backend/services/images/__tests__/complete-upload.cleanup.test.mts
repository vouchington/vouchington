import { createHash } from 'node:crypto'
import { chmod, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
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

  it('returns the durable processing handoff when temporary-file cleanup fails', async context => {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const bytes = Buffer.from(`cleanup ${image_id}`)
    const sha256 = createHash('sha256').update(bytes).digest()
    let spoolDirectory: string | undefined
    context.onTestFinished(async () => {
      if (!spoolDirectory) return
      await chmod(spoolDirectory, 0o700)
      await rm(spoolDirectory, { force: true, recursive: true })
    })
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([bytes]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)
    vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()
    vi.spyOn(s3Module, 'promoteFrozenImageToS3').mockImplementation(async ({ filename }) => {
      // A spool directory that is no longer writable makes the real temporary-file removal fail.
      spoolDirectory = dirname(filename)
      await chmod(spoolDirectory, 0o500)
      return { created: true, s3Key: sha256.toString('hex') }
    })
    vi.spyOn(s3Module, 'ensureImageDeliveryAliasInS3').mockResolvedValue({
      created: true,
      s3Key: image_id,
    })

    await expect(completeImageUpload(user, image_id)).resolves.toMatchObject({
      id: image_id,
      s3_key: sha256.toString('hex'),
    })

    expect((await stat(`${spoolDirectory}/media`)).size).toBe(bytes.byteLength)
    expect((await getImageById(image_id))?.s3_key).toBe(sha256.toString('hex'))
  })
})
