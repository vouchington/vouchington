import { mkdtempSync, writeFileSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gunzipBytes, gzipBytes } from '@modules/utils/compression'
import { downloadCrawlHtmlToTempFile, uploadCrawlHtmlFileToS3, uploadCrawlHtmlToS3 } from './s3.mts'

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

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => {
  const mockSend = vi.fn<VitestLooseMock>()
  return {
    ...(await importOriginal<typeof import('@modules/aws')>()),
    S3ImagesClient: {
      send: mockSend,
    } as unknown as typeof import('@modules/aws').S3ImagesClient,
  }
})

import { S3Buckets, S3ImagesClient } from '@modules/aws'

describe('s3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('crawl S3 operations', () => {
    const mockSend = vi.mocked(S3ImagesClient.send)

    it('should upload gzipped HTML with correct S3 key', async () => {
      const html = Buffer.from('<html>test</html>')
      let uploadedBody: Buffer | null = null

      mockSend.mockImplementationOnce(async command => {
        const input = (command as unknown as { input: Record<string, unknown> }).input
        expect(input.Body).toBeInstanceOf(Readable)
        uploadedBody = await collectReadable(input.Body as Readable)
        expect(input.ContentLength).toBe(uploadedBody.byteLength)
        return {} as never
      })

      await uploadCrawlHtmlToS3('example.com', 'url-123', 'deadbeef', html)

      expect(mockSend).toHaveBeenCalledOnce()
      const command = mockSend.mock.calls[0]![0] as unknown as { input: Record<string, unknown> }
      expect(command.input.Bucket).toBe(S3Buckets.crawls)
      expect(command.input.Key).toBe('example.com/url-123/deadbeef')
      expect(command.input.ContentType).toBe('text/html')
      expect(command.input.ContentEncoding).toBe('gzip')
      expect(command.input.StorageClass).toBe('REDUCED_REDUNDANCY')
      expect(uploadedBody).not.toBeNull()
      const unzipped = await gunzipBytes(uploadedBody!)
      expect(Buffer.from(unzipped).equals(html)).toBe(true)
    })

    it('should construct correct key format', async () => {
      mockSend.mockResolvedValueOnce({} as never)

      await uploadCrawlHtmlToS3('sub.example.com', 'abc-def', 'cafef00d', Buffer.from('test'))

      const command = mockSend.mock.calls[0]![0] as unknown as { input: Record<string, unknown> }
      expect(command.input.Key).toBe('sub.example.com/abc-def/cafef00d')
    })

    it('should fetch and decompress HTML from S3', async () => {
      const html = '<html><body>Hello</body></html>'
      const gzipped = await gzipBytes(Buffer.from(html))

      mockSend.mockResolvedValueOnce({
        Body: Readable.from([gzipped]),
      } as never)

      const result = await downloadCrawlHtmlToTempFile('example.com', 'url-123', 'deadbeef')

      expect(result).not.toBeNull()
      expect((await fsPromises.readFile(result!.filePath)).toString()).toBe(html)
      expect(result!.byteLength).toBe(Buffer.byteLength(html))
      await result!.cleanup()
      await expect(fsPromises.access(result!.filePath)).rejects.toThrow(/ENOENT/)
      await expect(result!.cleanup()).resolves.toBeUndefined()

      const command = mockSend.mock.calls[0]![0] as unknown as { input: Record<string, unknown> }
      expect(command.input.Bucket).toBe(S3Buckets.crawls)
      expect(command.input.Key).toBe('example.com/url-123/deadbeef')
    })

    it('should fetch and decompress HTML from S3 when Body is a web ReadableStream', async () => {
      const html = '<html><body>Web stream</body></html>'
      const gzipped = await gzipBytes(Buffer.from(html))

      mockSend.mockResolvedValueOnce({
        Body: Readable.toWeb(Readable.from([gzipped])),
      } as never)

      const result = await downloadCrawlHtmlToTempFile('example.com', 'url-123', 'deadbeef')

      expect(result).not.toBeNull()
      expect((await fsPromises.readFile(result!.filePath)).toString()).toBe(html)
      await result!.cleanup()
    })

    it('should return null for NoSuchKey error', async () => {
      const error = new Error('NoSuchKey')
      error.name = 'NoSuchKey'
      mockSend.mockRejectedValueOnce(error)

      const result = await downloadCrawlHtmlToTempFile('example.com', 'url-123', 'deadbeef')
      expect(result).toBeNull()
    })

    it('should return null when Body is empty', async () => {
      mockSend.mockResolvedValueOnce({
        Body: null,
      } as never)

      const result = await downloadCrawlHtmlToTempFile('example.com', 'url-123', 'deadbeef')
      expect(result).toBeNull()
    })

    it('should throw non-NoSuchKey errors', async () => {
      const error = new Error('AccessDenied')
      error.name = 'AccessDenied'
      mockSend.mockRejectedValueOnce(error)

      await expect(
        downloadCrawlHtmlToTempFile('example.com', 'url-123', 'deadbeef'),
      ).rejects.toThrow('AccessDenied')
    })

    it('stops decompression at the caller byte budget without returning a partial file', async () => {
      const gzipped = await gzipBytes(Buffer.alloc(1025, 'a'))
      mockSend.mockResolvedValueOnce({ Body: Readable.from([gzipped]) } as never)

      await expect(
        downloadCrawlHtmlToTempFile('example.com', 'url-123', 'deadbeef', 1024),
      ).rejects.toThrow('exceeds 1024 bytes')
    })

    it('destroys an unread buffer upload stream when send resolves without reading', async () => {
      const captured = captureUnreadBody(false)
      await uploadCrawlHtmlToS3(
        'example.com',
        'url-123',
        'deadbeef',
        Buffer.from('<html>closed</html>'),
      )
      expectUnreadBodyClosed(captured)
      await expect(fsPromises.access(recordedGzipDirectories.paths[0]!)).rejects.toThrow(/ENOENT/)
    })

    it('destroys an unread buffer upload stream when send rejects without reading', async () => {
      const captured = captureUnreadBody(true)
      await expect(
        uploadCrawlHtmlToS3(
          'example.com',
          'url-123',
          'deadbeef',
          Buffer.from('<html>closed</html>'),
        ),
      ).rejects.toThrow('upload failed')
      expectUnreadBodyClosed(captured)
      await expect(fsPromises.access(recordedGzipDirectories.paths[0]!)).rejects.toThrow(/ENOENT/)
    })

    it('destroys an unread file upload stream when send resolves without reading', async () => {
      const source = createSourceHtmlFile()
      try {
        const captured = captureUnreadBody(false)
        await uploadCrawlHtmlFileToS3('example.com', 'url-123', 'deadbeef', source.filePath)
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
          uploadCrawlHtmlFileToS3('example.com', 'url-123', 'deadbeef', source.filePath),
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
      mockSend.mockImplementationOnce(async command => {
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

  async function collectReadable(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
})
