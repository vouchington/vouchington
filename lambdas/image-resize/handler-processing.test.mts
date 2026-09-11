import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { SideloadConfig } from './config.mts'
import {
  defaultImageRequestDependencies,
  type ImageRequestDependencies,
  processImageRequest,
} from './handler-processing.mts'
import { S3OperationError } from './errors.mts'
import type { TempImageFile } from './temp-file.mts'

const CONFIG: SideloadConfig = {
  s3_bucket_cache: { bucket: 'cache', region: 'us-west-2' },
  widths: [8],
  qualities: [75],
  maxHeight: 100,
}

describe('image request processing temp artifacts', () => {
  it('uses the default transform dependency for buffers and files', async () => {
    const source = await createInputImage()
    try {
      const buffer = await defaultImageRequestDependencies.transformImage(
        await sharp(source.path).toBuffer(),
        imageOptions(),
      )
      expect(Buffer.isBuffer(buffer)).toBe(true)

      const file = await defaultImageRequestDependencies.transformImage(source, imageOptions())
      expect(Buffer.isBuffer(file)).toBe(false)
      if (!Buffer.isBuffer(file)) await file.cleanup()
    } finally {
      await source.cleanup()
    }
  })

  it('builds a cached file response and releases the cache artifact', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cached-image-test-'))
    const path = join(directory, 'cached')
    await writeFile(path, 'cached-image')
    let cleaned = false
    const dependencies = {
      createS3Client: () => ({}) as ReturnType<ImageRequestDependencies['createS3Client']>,
      fetchImageFromS3: async () => ({
        file: {
          path,
          cleanup: async () => {
            cleaned = true
            await rm(directory, { recursive: true, force: true })
          },
        },
        etag: 'etag',
        contentType: 'image/jpeg',
      }),
      putImageToCache: async () => undefined,
      transformImage: async () => {
        throw new Error('transform must not run on a cache hit')
      },
      captureCacheWriteError: () => undefined,
    } satisfies ImageRequestDependencies

    const response = await processImageRequest(
      { width: 8, quality: 75, lossless: false, progressive: false },
      CONFIG,
      'jpeg',
      8,
      75,
      'cache-key',
      async () => {
        throw new S3OperationError('origin must not run', 500)
      },
      dependencies,
    )

    expect(response).toMatchObject({ statusCode: 200, isBase64Encoded: true })
    expect(cleaned).toBe(true)
  })

  it('rejects a cache fetch that returns no artifact', async () => {
    const dependencies = {
      createS3Client: () => ({}) as ReturnType<ImageRequestDependencies['createS3Client']>,
      fetchImageFromS3: async () => ({ etag: 'etag', contentType: 'image/jpeg' }),
      putImageToCache: async () => undefined,
      transformImage: async input => input,
      captureCacheWriteError: () => undefined,
    } satisfies ImageRequestDependencies

    await expect(
      processImageRequest(
        { width: 8, quality: 75, lossless: false, progressive: false },
        CONFIG,
        'jpeg',
        8,
        75,
        'cache-key',
        async () => {
          throw new Error('origin must not run')
        },
        dependencies,
      ),
    ).rejects.toThrow('Image fetch returned no artifact')
  })
})

function imageOptions() {
  return {
    width: 8,
    quality: 75,
    lossless: false,
    progressive: false,
    format: 'jpeg' as const,
  }
}

async function createInputImage(): Promise<TempImageFile> {
  const directory = await mkdtemp(join(tmpdir(), 'handler-processing-test-'))
  const path = join(directory, 'input.png')
  await writeFile(
    path,
    await sharp({ create: { width: 16, height: 16, channels: 3, background: 'red' } })
      .png()
      .toBuffer(),
  )
  return { path, cleanup: async () => rm(directory, { recursive: true, force: true }) }
}
