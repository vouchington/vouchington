import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { vi } from 'vitest'

export function spyOnSitemapObjectStore<Metadata>(
  objects: Map<string, Buffer>,
  rejectPut: (key: string) => Error | undefined,
  metadata = new Map<string, Metadata>(),
  rejectDelete: (key: string) => Error | undefined = () => undefined,
): void {
  vi.spyOn(S3Client.prototype, 'send').mockImplementation(async command => {
    if (command instanceof HeadObjectCommand) {
      const manifest = metadata.get(command.input.Key!)
      if (!manifest)
        throw new NoSuchKey({ message: 'missing object', $metadata: { httpStatusCode: 404 } })
      return { Metadata: { 'sitemap-manifest': JSON.stringify(manifest) } } as never
    }
    if (command instanceof ListObjectsV2Command) return { Contents: [] } as never
    if (command instanceof GetObjectCommand) {
      const body = objects.get(command.input.Key!)
      if (!body)
        throw new NoSuchKey({ message: 'missing object', $metadata: { httpStatusCode: 404 } })
      return { Body: { transformToString: async () => body.toString() } } as never
    }
    if (command instanceof PutObjectCommand) {
      const key = command.input.Key!
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
    if (command instanceof DeleteObjectCommand) {
      const failure = rejectDelete(command.input.Key!)
      if (failure) throw failure
      objects.delete(command.input.Key!)
      return {} as never
    }
    throw new Error(`Unexpected S3 command: ${command.constructor.name}`)
  })
}
