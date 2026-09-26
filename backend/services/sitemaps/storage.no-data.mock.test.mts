import { mkdtempSync, writeFileSync } from 'node:fs'
import { access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockSend: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => {
  return {
    ...(await importOriginal<typeof import('@modules/aws')>()),
    S3ImagesClient: {
      send: mocks.mockSend,
    } as unknown as typeof import('@modules/aws').S3ImagesClient,
  }
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
