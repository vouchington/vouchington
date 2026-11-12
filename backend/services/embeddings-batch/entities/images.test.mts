import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, onTestFinished } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { deleteS3Object, putS3Object, uniqueS3Prefix } from '@voucha/test-helpers/aws-emulator-s3'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { BatchFileBuilder } from '../orchestrator/file-builder.mts'
import { addImageToBatch } from './images.mts'

const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function storedImage(bytes: Buffer, contentType: string) {
  const Bucket = S3Buckets.images
  const Key = `${uniqueS3Prefix('gemini-source')}image`
  await putS3Object({ Bucket, Key, Body: bytes, ContentType: contentType })
  onTestFinished(() => deleteS3Object(Bucket, Key))
  return { id: randomUUID(), s3_key: Key, sha_256: Buffer.alloc(32) }
}

describe('private image batch input', () => {
  it.each([
    { bytes: gif, contentType: 'image/gif' },
    { bytes: png, contentType: 'image/png' },
  ])('copies a private $contentType upload into a JPEG GCS part', async source => {
    const image = await storedImage(source.bytes, source.contentType)
    const fixture = createVertexHttpFixture()
    let uploaded: Buffer | undefined
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'POST', path: /\/upload\/storage\/v1\// })
      .reply(200, options => {
        uploaded = Buffer.from(options.body as Uint8Array)
        return {}
      })
    const builder = new BatchFileBuilder('images')
    onTestFinished(() => builder.cleanup())
    await expect(fixture.run(() => addImageToBatch(builder, image, 10))).resolves.toBe(true)
    const { filePath } = await builder.close()
    const record = JSON.parse(await readFile(filePath, 'utf8'))
    expect(record).toMatchObject({
      key: `image:${image.id}`,
      request: {
        content: {
          parts: [
            { fileData: { mimeType: 'image/jpeg', fileUri: expect.stringMatching(/^gs:\/\//) } },
          ],
        },
      },
    })
    expect(uploaded?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    expect(uploaded!.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024)
  })

  it('leaves image work retryable when GCS rejects the copy', async () => {
    const image = await storedImage(gif, 'image/gif')
    const fixture = createVertexHttpFixture()
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'POST', path: /\/upload\/storage\/v1\// })
      .reply(503, {})
    const builder = new BatchFileBuilder('images')
    onTestFinished(() => builder.cleanup())
    await expect(fixture.run(() => addImageToBatch(builder, image, 10))).rejects.toThrow('(503)')
  })
})
