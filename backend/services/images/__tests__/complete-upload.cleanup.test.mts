import { createHash } from 'node:crypto'
import { chmod, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { createTestUser } from '@voucha/test-helpers'
import { putS3Object, readS3ObjectBytes } from '@voucha/test-helpers/aws-emulator-s3'
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

  afterAll(() => {
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
    let spooledFile: string | undefined
    context.onTestFinished(async () => {
      if (!spoolDirectory) return
      await chmod(spoolDirectory, 0o700)
      await rm(spoolDirectory, { force: true, recursive: true })
    })
    await putS3Object({ Bucket: S3Buckets.imageUploads, Key: image_id, Body: bytes })
    // Storage stays real: this only observes the frozen file and makes its directory read-only
    // before the real promotion reads it.
    const promote = s3Module.promoteFrozenImageToS3
    vi.spyOn(s3Module, 'promoteFrozenImageToS3').mockImplementation(async image => {
      // A spool directory that is no longer writable makes the real temporary-file removal fail.
      spooledFile = image.filename
      spoolDirectory = dirname(image.filename)
      await chmod(spoolDirectory, 0o500)
      return promote(image)
    })

    await expect(completeImageUpload(user, image_id)).resolves.toMatchObject({
      id: image_id,
      s3_key: sha256.toString('hex'),
    })

    expect((await stat(spooledFile!)).size).toBe(bytes.byteLength)
    expect((await getImageById(image_id))?.s3_key).toBe(sha256.toString('hex'))
    await expect(readS3ObjectBytes(S3Buckets.images, sha256.toString('hex'))).resolves.toEqual(
      bytes,
    )
  })
})
