import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emulatorS3, putS3Object, readS3ObjectText } from '@voucha/test-helpers/aws-emulator-s3'
import { denyS3ObjectActions, useOwnedS3Bucket } from '@voucha/test-helpers/s3-owned-bucket'
import { getSitemapFamilyManifest, putSitemapObjectFile } from './storage.mts'
import { applyStoragePrefix } from './storage-prefix.mts'

const manifest = {
  active_page_count: 3,
  generation_id: '11111111-1111-4111-8111-111111111111',
  generated_at: '2026-06-10T12:00:00.000Z',
  content_hash: 'content-hash',
}
const familyIndexKey = 'sitemaps/families/topics.xml'

/** A bucket and storage prefix owned by this test, so the fixed family path cannot collide. */
async function ownedSitemapStorage(): Promise<string> {
  vi.stubEnv('SITEMAP_S3_PREFIX', `sitemap-storage-${randomUUID()}`)
  return useOwnedS3Bucket('sitemaps')
}

describe('sitemap storage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('treats a missing family manifest as empty storage', async () => {
    await ownedSitemapStorage()

    await expect(getSitemapFamilyManifest('topics')).resolves.toBeNull()
  })

  it('propagates access denial without treating it as a missing manifest', async () => {
    const bucket = await ownedSitemapStorage()
    const key = applyStoragePrefix(familyIndexKey)
    await putS3Object({
      Bucket: bucket,
      Key: key,
      Body: 'index',
      Metadata: { 'sitemap-manifest': JSON.stringify(manifest) },
    })
    await denyS3ObjectActions(bucket, [{ action: 's3:GetObject', keys: [key] }])

    await expect(getSitemapFamilyManifest('topics')).rejects.toMatchObject({
      $metadata: { httpStatusCode: 403 },
    })
  })

  it('loads the manifest committed atomically with the public family index', async () => {
    const bucket = await ownedSitemapStorage()
    await putS3Object({
      Bucket: bucket,
      Key: applyStoragePrefix(familyIndexKey),
      Body: 'index',
      Metadata: { 'sitemap-manifest': JSON.stringify(manifest) },
    })

    await expect(getSitemapFamilyManifest('topics')).resolves.toEqual(manifest)
  })

  it('writes XML and its compact publication manifest in one upload', async () => {
    const bucket = await ownedSitemapStorage()
    const file = createSitemapUploadFile()
    try {
      await putSitemapObjectFile(familyIndexKey, file.filePath, {
        contentType: 'application/xml; charset=utf-8',
        contentEncoding: 'gzip',
        manifest,
      })
    } finally {
      await rm(file.directory, { recursive: true, force: true })
    }

    const key = applyStoragePrefix(familyIndexKey)
    const head = await emulatorS3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    expect(head).toMatchObject({
      ContentType: 'application/xml; charset=utf-8',
      ContentEncoding: 'gzip',
      Metadata: { 'sitemap-manifest': JSON.stringify(manifest) },
    })
    expect(await readS3ObjectText(bucket, key)).toBe('sitemap-bytes')
    await expect(getSitemapFamilyManifest('topics')).resolves.toEqual(manifest)
  })

  it('rejects a public index whose publication metadata is missing', async () => {
    const bucket = await ownedSitemapStorage()
    await putS3Object({ Bucket: bucket, Key: applyStoragePrefix(familyIndexKey), Body: 'index' })

    await expect(getSitemapFamilyManifest('topics')).rejects.toThrow(
      'Published sitemap index is missing its manifest',
    )
  })

  // A real upload always reads its body; only an injected send can leave the stream unread.
  it('destroys an unread file upload stream when send resolves without reading', async () => {
    await ownedSitemapStorage()
    const file = createSitemapUploadFile()
    const captured = captureUnreadSitemapBody(false)
    try {
      await putSitemapObjectFile('sitemaps/static.xml', file.filePath, {
        contentType: 'application/xml; charset=utf-8',
        contentEncoding: 'gzip',
      })
      expect(captured.errors).toEqual([])
      expect(captured.body?.destroyed).toBe(true)
      await rm(file.filePath)
      expect(captured.errors).toEqual([])
    } finally {
      await rm(file.directory, { recursive: true, force: true })
    }
  })

  it('destroys an unread file upload stream when send rejects without reading', async () => {
    await ownedSitemapStorage()
    const file = createSitemapUploadFile()
    const captured = captureUnreadSitemapBody(true)
    try {
      await expect(
        putSitemapObjectFile('sitemaps/static.xml', file.filePath, {
          contentType: 'application/xml; charset=utf-8',
          contentEncoding: 'gzip',
        }),
      ).rejects.toThrow('upload failed')
      expect(captured.errors).toEqual([])
      expect(captured.body?.destroyed).toBe(true)
      await rm(file.filePath)
      expect(captured.errors).toEqual([])
    } finally {
      await rm(file.directory, { recursive: true, force: true })
    }
  })
})

function createSitemapUploadFile(): { directory: string; filePath: string } {
  const directory = mkdtempSync(join(tmpdir(), 'sitemap-upload-'))
  const filePath = join(directory, 'page.xml.gz')
  writeFileSync(filePath, 'sitemap-bytes')
  return { directory, filePath }
}

function captureUnreadSitemapBody(rejectSend: boolean): { errors: unknown[]; body?: Readable } {
  const captured: { errors: unknown[]; body?: Readable } = { errors: [] }
  vi.spyOn(S3Client.prototype, 'send').mockImplementationOnce(async command => {
    const body = (command as { input: { Body: Readable } }).input.Body
    captured.body = body
    body.on('error', error => {
      captured.errors.push(error)
    })
    if (rejectSend) throw new Error('upload failed')
    return {} as never
  })
  return captured
}
