import { randomUUID } from 'node:crypto'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { onTestFinished, vi } from 'vitest'

export function spyOnSitemapObjectStore<Metadata>(
  objects: Map<string, Buffer>,
  rejectPut: (key: string) => Error | undefined,
  metadata = new Map<string, Metadata>(),
  rejectDelete: (key: string) => Error | undefined = () => undefined,
): void {
  const prefix = `sitemap-fixture-${randomUUID()}/`
  vi.stubEnv('SITEMAP_S3_PREFIX', prefix)
  onTestFinished(async () => {
    await cacheValkeyClient.unlink([`${prefix}sitemaps:posts:tracked-range:v1`])
  })
  const logicalKey = (key: string): string => {
    if (!key.startsWith(prefix)) throw new Error('Sitemap fixture escaped its storage namespace')
    return key.slice(prefix.length)
  }
  vi.spyOn(S3Client.prototype, 'send').mockImplementation(async command => {
    if (command instanceof HeadObjectCommand) {
      const manifest = metadata.get(logicalKey(command.input.Key!))
      if (!manifest)
        throw new NoSuchKey({ message: 'missing object', $metadata: { httpStatusCode: 404 } })
      return { Metadata: { 'sitemap-manifest': JSON.stringify(manifest) } } as never
    }
    if (command instanceof ListObjectsV2Command) {
      const keyPrefix = logicalKey(command.input.Prefix!)
      const after = command.input.StartAfter ? logicalKey(command.input.StartAfter) : null
      const keys = [...objects.keys()]
        .filter(key => key.startsWith(keyPrefix) && (after === null || key > after))
        .toSorted()
      const limit = command.input.MaxKeys ?? 1000
      return {
        Contents: keys.slice(0, limit).map(key => ({ Key: `${prefix}${key}` })),
        IsTruncated: keys.length > limit,
      } as never
    }
    if (command instanceof GetObjectCommand) {
      const body = objects.get(logicalKey(command.input.Key!))
      if (!body)
        throw new NoSuchKey({ message: 'missing object', $metadata: { httpStatusCode: 404 } })
      return { Body: { transformToString: async () => body.toString() } } as never
    }
    if (command instanceof PutObjectCommand) {
      const key = logicalKey(command.input.Key!)
      const failure = rejectPut(key)
      if (failure) throw failure
      const body = command.input.Body
      const chunks: Buffer[] = []
      if (typeof body === 'string' || body instanceof Uint8Array) {
        chunks.push(Buffer.from(body))
      } else {
        for await (const chunk of body as Readable) chunks.push(Buffer.from(chunk))
      }
      const bytes = Buffer.concat(chunks)
      objects.set(key, bytes)
      if (command.input.Metadata?.['sitemap-manifest'])
        metadata.set(key, JSON.parse(command.input.Metadata['sitemap-manifest']) as Metadata)
      return {} as never
    }
    if (command instanceof DeleteObjectsCommand) {
      for (const object of command.input.Delete?.Objects ?? []) {
        const key = logicalKey(object.Key!)
        const failure = rejectDelete(key)
        if (failure) throw failure
        objects.delete(key)
        metadata.delete(key)
      }
      return {} as never
    }
    if (command instanceof DeleteObjectCommand) {
      const failure = rejectDelete(logicalKey(command.input.Key!))
      if (failure) throw failure
      objects.delete(logicalKey(command.input.Key!))
      metadata.delete(logicalKey(command.input.Key!))
      return {} as never
    }
    throw new Error(`Unexpected S3 command: ${command.constructor.name}`)
  })
}
