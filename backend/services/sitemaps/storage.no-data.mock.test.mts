import { mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockSend: vi.fn<typeof import('@aws-sdk/client-s3').S3Client.prototype.send>(),
}))

vi.mock<typeof import('@aws-sdk/client-s3')>(import('@aws-sdk/client-s3'), async importOriginal => {
  const sdk = await importOriginal()
  vi.spyOn(sdk.S3Client.prototype, 'send').mockImplementation(mocks.mockSend)
  return sdk
})

import {
  getSitemapFamilyManifest,
  putSitemapFamilyManifest,
  putSitemapObjectFile,
} from './storage.mts'
import { S3Buckets } from '@modules/aws'

describe('sitemap storage', () => {
  beforeEach(() => {
    mocks.mockSend.mockReset()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it.each([
    Object.assign(new Error('missing object'), { name: 'NoSuchKey' }),
    Object.assign(new Error('missing object'), { $metadata: { httpStatusCode: 404 } }),
  ])('treats a missing family manifest as empty storage', async missing => {
    mocks.mockSend.mockRejectedValueOnce(missing)

    await expect(getSitemapFamilyManifest('topics')).resolves.toBeNull()
    expect(mocks.mockSend).toHaveBeenCalledOnce()
  })

  it('propagates access denial without treating it as a missing manifest', async () => {
    const failure = Object.assign(new Error('access denied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    })
    mocks.mockSend.mockRejectedValueOnce(failure)

    await expect(getSitemapFamilyManifest('topics')).rejects.toBe(failure)
    expect(mocks.mockSend).toHaveBeenCalledOnce()
  })

  it('loads family manifests from the family meta key as JSON', async () => {
    const manifest = {
      active_page_count: 3,
      highest_written_page: 3,
      generated_at: '2026-06-10T12:00:00.000Z',
      content_hashes: { '1.xml': 'hash-1', 'index.xml': 'hash-index' },
    }
    mocks.mockSend.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn<VitestLooseMock>().mockResolvedValue(JSON.stringify(manifest)),
      },
    } as never)

    await expect(getSitemapFamilyManifest('topics')).resolves.toEqual(manifest)

    expect(mocks.mockSend).toHaveBeenCalledOnce()
    const command = mocks.mockSend.mock.calls[0]![0] as GetObjectCommand
    expect(command.input).toMatchObject({
      Bucket: S3Buckets.sitemaps,
      Key: 'families/topics/_meta.json',
    })
  })

  it('writes family manifests back to the family meta key as JSON', async () => {
    const manifest = {
      active_page_count: 4,
      highest_written_page: 4,
      generated_at: '2026-06-10T12:00:00.000Z',
      content_hashes: { '1.xml': 'hash-1', '2.xml': 'hash-2', 'index.xml': 'hash-index' },
    }
    mocks.mockSend.mockResolvedValueOnce({} as never)

    await putSitemapFamilyManifest('topics', manifest)

    expect(mocks.mockSend).toHaveBeenCalledOnce()
    const command = mocks.mockSend.mock.calls[0]![0] as PutObjectCommand
    expect(command.input).toMatchObject({
      Bucket: S3Buckets.sitemaps,
      Key: 'families/topics/_meta.json',
      Body: JSON.stringify(manifest),
      ContentType: 'application/json; charset=utf-8',
    })
  })

  it('destroys an unread file upload stream when send resolves without reading', async () => {
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
  mocks.mockSend.mockImplementationOnce(async command => {
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
