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

import { getSitemapFamilyManifest, putSitemapFamilyManifest } from './storage.mts'
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
})
