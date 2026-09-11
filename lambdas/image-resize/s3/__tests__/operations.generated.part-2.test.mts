import { describe, it, expect, vi } from 'vitest'
import type { S3Client } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { fetchImageFromS3, putImageToCache } from '../operations.mts'
import { S3OperationError } from '../../errors.mts'

describe('fetchImageFromS3', () => {
  it('should fetch image from S3', async () => {
    const mockBuffer = Buffer.from('image data')
    const mockStream = Readable.from([mockBuffer])

    const mockClient = {
      send: vi.fn<VitestLooseMock>().mockResolvedValue({
        Body: mockStream,
        ETag: '"abc123"',
        ContentType: 'image/jpeg',
      }),
    } as unknown as S3Client

    const result = await fetchImageFromS3(mockClient, 'test-bucket', 'test-key')

    try {
      expect(await readFile(result.file!.path)).toEqual(mockBuffer)
      expect(result.etag).toBe('"abc123"')
      expect(result.contentType).toBe('image/jpeg')
    } finally {
      await result.file!.cleanup()
    }
  })

  it('should throw 404 error for missing key', async () => {
    const mockClient = {
      send: vi.fn<VitestLooseMock>().mockRejectedValue({
        name: 'NoSuchKey',
        message: 'Key not found',
      }),
    } as unknown as S3Client

    const err1 = await fetchImageFromS3(mockClient, 'test-bucket', 'missing-key').catch(e => e)
    expect(err1).toBeInstanceOf(S3OperationError)
    expect(err1.statusCode).toBe(404)
  })

  it('should throw 404 error for 404 status code', async () => {
    const mockClient = {
      send: vi.fn<VitestLooseMock>().mockRejectedValue({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      }),
    } as unknown as S3Client

    const err2 = await fetchImageFromS3(mockClient, 'test-bucket', 'missing-key').catch(e => e)
    expect(err2).toBeInstanceOf(S3OperationError)
    expect(err2.statusCode).toBe(404)
  })

  it('should throw 500 error for other S3 errors', async () => {
    const mockClient = {
      send: vi.fn<VitestLooseMock>().mockRejectedValue({
        name: 'ServiceError',
        message: 'Internal error',
      }),
    } as unknown as S3Client

    const err3 = await fetchImageFromS3(mockClient, 'test-bucket', 'test-key').catch(e => e)
    expect(err3).toBeInstanceOf(S3OperationError)
    expect(err3.statusCode).toBe(500)
  })

  it('should throw error if no body in response', async () => {
    const mockClient = {
      send: vi.fn<VitestLooseMock>().mockResolvedValue({
        Body: null,
        ETag: '"abc123"',
      }),
    } as unknown as S3Client

    await expect(fetchImageFromS3(mockClient, 'test-bucket', 'test-key')).rejects.toThrow(
      S3OperationError,
    )
  })
})

describe('putImageToCache', () => {
  it('should put image to cache with correct parameters', async () => {
    const mockSend = vi.fn<VitestLooseMock>().mockResolvedValue({})
    const mockClient = {
      send: mockSend,
    } as unknown as S3Client

    const buffer = Buffer.from('cached image')
    await putImageToCache(
      mockClient,
      'cache-bucket',
      'cache-key',
      buffer,
      'image/webp',
      '"origin-etag"',
    )

    expect(mockSend).toHaveBeenCalledOnce()
    const command = mockSend.mock.calls[0][0]
    expect(command.input.Bucket).toBe('cache-bucket')
    expect(command.input.Key).toBe('cache-key')
    expect(command.input.Body).toBe(buffer)
    expect(command.input.ContentType).toBe('image/webp')
    expect(command.input.StorageClass).toBe('ONEZONE_IA')
    expect(command.input.CacheControl).toBe('public, max-age=31536000, immutable')
    expect(command.input.Metadata?.originEtag).toBe('origin-etag')
  })

  it('should strip quotes from etag in metadata', async () => {
    const mockSend = vi.fn<VitestLooseMock>().mockResolvedValue({})
    const mockClient = {
      send: mockSend,
    } as unknown as S3Client

    await putImageToCache(
      mockClient,
      'cache-bucket',
      'cache-key',
      Buffer.from('test'),
      'image/png',
      '"quoted-etag"',
    )

    const command = mockSend.mock.calls[0][0]
    expect(command.input.Metadata?.originEtag).toBe('quoted-etag')
  })

  it('should throw error on S3 failure', async () => {
    const mockClient = {
      send: vi.fn<VitestLooseMock>().mockRejectedValue({
        name: 'ServiceError',
        message: 'Write failed',
      }),
    } as unknown as S3Client

    await expect(
      putImageToCache(
        mockClient,
        'cache-bucket',
        'cache-key',
        Buffer.from('test'),
        'image/jpeg',
        '"etag"',
      ),
    ).rejects.toThrow(S3OperationError)
  })
})
