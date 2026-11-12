import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { gunzipSync, gzipSync } from 'node:zlib'
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { emulatorS3, putS3Object, s3ObjectExists } from '@voucha/test-helpers/aws-emulator-s3'
import { denyS3ObjectActions, useOwnedS3Bucket } from '@voucha/test-helpers/s3-owned-bucket'
import { downloadCrawlHtmlToTempFile, uploadCrawlHtmlFileToS3 } from './s3.mts'

const recordedGzipDirectories = vi.hoisted(() => ({ paths: [] as string[] }))

vi.mock<typeof import('node:fs/promises')>(import('node:fs/promises'), async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    mkdtemp: (async (...args: Parameters<typeof actual.mkdtemp>) => {
      const directory = await actual.mkdtemp(...args)
      recordedGzipDirectories.paths.push(directory)
      return directory
    }) as typeof actual.mkdtemp,
  }
})

/** A hostname no other test or fork writes, so crawl keys stay owned in the shared bucket. */
function ownedHostname(): string {
  return `crawl-${randomUUID()}.example.com`
}

async function seedCrawlObject(key: string, body: Uint8Array): Promise<void> {
  await putS3Object({ Bucket: S3Buckets.crawls, Key: key, Body: body, ContentEncoding: 'gzip' })
}

describe('s3', () => {
  beforeEach(() => {
    recordedGzipDirectories.paths.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('crawl S3 operations', () => {
    it('propagates a vanished upload source and removes its partial gzip directory', async () => {
      const hostname = ownedHostname()
      const directory = mkdtempSync(path.join(os.tmpdir(), 'crawl-vanished-source-'))
      const filePath = path.join(directory, 'page.html')
      writeFileSync(filePath, '<html>vanished</html>')
      await fsPromises.rm(filePath)
      try {
        await expect(
          uploadCrawlHtmlFileToS3(hostname, 'missing-source', 'deadbeef', filePath),
        ).rejects.toMatchObject({ code: 'ENOENT', path: filePath })
        expect(await s3ObjectExists(S3Buckets.crawls, `${hostname}/missing-source/deadbeef`)).toBe(
          false,
        )
        expect(recordedGzipDirectories.paths).toHaveLength(1)
        await expect(fsPromises.access(recordedGzipDirectories.paths[0]!)).rejects.toMatchObject({
          code: 'ENOENT',
        })
      } finally {
        await fsPromises.rm(directory, { recursive: true, force: true })
      }
    })

    it('stores gzipped HTML with its encoding, type, and storage class', async () => {
      const hostname = ownedHostname()
      const key = `${hostname}/url-123/deadbeef`
      const source = createSourceHtmlFile()
      const html = await fsPromises.readFile(source.filePath)

      try {
        await uploadCrawlHtmlFileToS3(hostname, 'url-123', 'deadbeef', source.filePath)

        const stored = await emulatorS3().send(
          new GetObjectCommand({ Bucket: S3Buckets.crawls, Key: key }),
        )
        const body = Buffer.from(await stored.Body!.transformToByteArray())
        expect(stored).toMatchObject({
          ContentType: 'text/html',
          ContentEncoding: 'gzip',
          ContentLength: body.byteLength,
        })
        expect(gunzipSync(body).equals(html)).toBe(true)
        const head = await emulatorS3().send(
          new HeadObjectCommand({ Bucket: S3Buckets.crawls, Key: key }),
        )
        expect(head.StorageClass).toBe('REDUCED_REDUNDANCY')
        await expect(fsPromises.access(recordedGzipDirectories.paths[0]!)).rejects.toThrow(/ENOENT/)
      } finally {
        await fsPromises.rm(source.directory, { recursive: true, force: true })
      }
    })

    it('should construct correct key format', async () => {
      const hostname = `sub.${ownedHostname()}`
      const source = createSourceHtmlFile()

      try {
        await uploadCrawlHtmlFileToS3(hostname, 'abc-def', 'cafef00d', source.filePath)

        expect(await s3ObjectExists(S3Buckets.crawls, `${hostname}/abc-def/cafef00d`)).toBe(true)
      } finally {
        await fsPromises.rm(source.directory, { recursive: true, force: true })
      }
    })

    it('should fetch and decompress HTML from S3', async () => {
      const hostname = ownedHostname()
      const html = '<html><body>Hello</body></html>'
      await seedCrawlObject(`${hostname}/url-123/deadbeef`, gzipSync(Buffer.from(html)))

      const result = await downloadCrawlHtmlToTempFile(hostname, 'url-123', 'deadbeef')

      expect(result).not.toBeNull()
      expect((await fsPromises.readFile(result!.filePath)).toString()).toBe(html)
      expect(result!.byteLength).toBe(Buffer.byteLength(html))
      await result!.cleanup()
      await expect(fsPromises.access(result!.filePath)).rejects.toThrow(/ENOENT/)
      await expect(result!.cleanup()).resolves.toBeUndefined()
    })

    // The Node SDK always returns a Node stream; a web stream body needs an injected response.
    it('should fetch and decompress HTML from S3 when Body is a web ReadableStream', async () => {
      const html = '<html><body>Web stream</body></html>'
      const gzipped = gzipSync(Buffer.from(html))
      vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
        Body: Readable.toWeb(Readable.from([gzipped])),
      } as never)

      const result = await downloadCrawlHtmlToTempFile(ownedHostname(), 'url-123', 'deadbeef')

      expect(result).not.toBeNull()
      expect((await fsPromises.readFile(result!.filePath)).toString()).toBe(html)
      await result!.cleanup()
    })

    it('should return null for a missing object', async () => {
      const result = await downloadCrawlHtmlToTempFile(ownedHostname(), 'url-123', 'deadbeef')
      expect(result).toBeNull()
      const downloadDirectory = recordedGzipDirectories.paths[0]!
      await expect(fsPromises.access(downloadDirectory)).rejects.toThrow(/ENOENT/)
    })

    // A real GetObject response always carries a body stream.
    it('should return null when Body is empty', async () => {
      vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({ Body: null } as never)

      const result = await downloadCrawlHtmlToTempFile(ownedHostname(), 'url-123', 'deadbeef')
      expect(result).toBeNull()
    })

    it('should throw non-NoSuchKey errors', async () => {
      const bucket = await useOwnedS3Bucket('crawls')
      const hostname = ownedHostname()
      const key = `${hostname}/url-123/deadbeef`
      await putS3Object({ Bucket: bucket, Key: key, Body: gzipSync('<html></html>') })
      await denyS3ObjectActions(bucket, [{ action: 's3:GetObject', keys: [key] }])

      await expect(
        downloadCrawlHtmlToTempFile(hostname, 'url-123', 'deadbeef'),
      ).rejects.toMatchObject({ name: 'AccessDenied' })
    })

    it('stops decompression at the caller byte budget without returning a partial file', async () => {
      const hostname = ownedHostname()
      await seedCrawlObject(`${hostname}/url-123/deadbeef`, gzipSync(Buffer.alloc(1025, 'a')))

      await expect(
        downloadCrawlHtmlToTempFile(hostname, 'url-123', 'deadbeef', 1024),
      ).rejects.toThrow('exceeds 1024 bytes')
      await expect(fsPromises.access(recordedGzipDirectories.paths[0]!)).rejects.toThrow(/ENOENT/)
    })

    // A real upload always reads its body; only an injected send can leave the stream unread.
    it('destroys an unread file upload stream when send resolves without reading', async () => {
      const source = createSourceHtmlFile()
      try {
        const captured = captureUnreadBody(false)
        await uploadCrawlHtmlFileToS3(ownedHostname(), 'url-123', 'deadbeef', source.filePath)
        expectUnreadBodyClosed(captured)
        await expect(fsPromises.access(recordedGzipDirectories.paths[0]!)).rejects.toThrow(/ENOENT/)
        await expect(fsPromises.access(source.filePath)).resolves.toBeUndefined()
      } finally {
        await fsPromises.rm(source.directory, { recursive: true, force: true })
      }
    })

    it('destroys an unread file upload stream when send rejects without reading', async () => {
      const source = createSourceHtmlFile()
      try {
        const captured = captureUnreadBody(true)
        await expect(
          uploadCrawlHtmlFileToS3(ownedHostname(), 'url-123', 'deadbeef', source.filePath),
        ).rejects.toThrow('upload failed')
        expectUnreadBodyClosed(captured)
        await expect(fsPromises.access(recordedGzipDirectories.paths[0]!)).rejects.toThrow(/ENOENT/)
        await expect(fsPromises.access(source.filePath)).resolves.toBeUndefined()
      } finally {
        await fsPromises.rm(source.directory, { recursive: true, force: true })
      }
    })

    function captureUnreadBody(rejectSend: boolean): { errors: unknown[]; body?: Readable } {
      recordedGzipDirectories.paths.length = 0
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

    function expectUnreadBodyClosed(captured: { errors: unknown[]; body?: Readable }): void {
      expect(captured.errors).toEqual([])
      expect(captured.body).toBeInstanceOf(Readable)
      expect(captured.body?.destroyed).toBe(true)
      expect(recordedGzipDirectories.paths).toHaveLength(1)
    }
  })

  function createSourceHtmlFile(): { directory: string; filePath: string } {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'crawl-html-source-'))
    const filePath = path.join(directory, 'page.html')
    writeFileSync(filePath, '<html>file</html>')
    return { directory, filePath }
  }
})
