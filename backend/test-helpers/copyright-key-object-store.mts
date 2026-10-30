import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { Readable } from 'node:stream'
import {
  GetObjectCommand,
  PutObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'

const PREFIX = 'retention-keys/'

/** External S3 fixture persists across Vitest forks sharing this worktree's dirty PostgreSQL DB. */
export function copyrightKeyObjectStoreRoot(): string {
  const worktree = process.env.WORKTREE_DIR
  if (!worktree || !/^[a-zA-Z0-9_-]+$/.test(worktree))
    throw new Error('Copyright S3 fixture requires WORKTREE_DIR')
  return join(tmpdir(), 'voucha-test-copyright-key-objects', worktree)
}

function objectFile(objectPath: string, bucket: string | undefined): string {
  if (!bucket || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(bucket))
    throw new Error('Unexpected copyright key fixture bucket')
  const id = objectPath.slice(PREFIX.length)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new Error('Unexpected copyright key fixture object path')
  return join(copyrightKeyObjectStoreRoot(), bucket, id)
}

class CopyrightFixtureProviderError extends Error {
  readonly $metadata: { httpStatusCode: number }
  constructor(name: string, status: number) {
    super(name)
    this.name = name
    this.$metadata = { httpStatusCode: status }
  }
}

function failure(name: string, status: number): Error {
  return new CopyrightFixtureProviderError(name, status)
}

/** Return null for every other bucket command, preserving the caller's normal offline policy. */
export function handleCopyrightKeyObjectCommand(command: unknown): Promise<unknown> | null {
  if (command instanceof PutObjectCommand && command.input.Key?.startsWith(PREFIX)) {
    const { Key, Body, IfNoneMatch, Bucket } = command.input
    return (async () => {
      if (typeof Body !== 'string' || IfNoneMatch !== '*')
        throw new Error('Copyright keys require immutable string-object PUT')
      await mkdir(dirname(objectFile(Key, Bucket)), { recursive: true })
      try {
        await writeFile(objectFile(Key, Bucket), Body, { flag: 'wx', mode: 0o600 })
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST')
          throw failure('PreconditionFailed', 412)
        throw err
      }
      return { $metadata: {}, VersionId: '1' }
    })()
  }
  if (command instanceof GetObjectCommand && command.input.Key?.startsWith(PREFIX)) {
    const objectPath = command.input.Key
    return (async () => {
      try {
        const body = await readFile(objectFile(objectPath, command.input.Bucket))
        return {
          $metadata: {},
          ContentLength: body.length,
          Body: Readable.from([body]),
          VersionId: '1',
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw failure('NoSuchKey', 404)
        throw err
      }
    })()
  }
  if (command instanceof ListObjectVersionsCommand && command.input.Prefix?.startsWith(PREFIX)) {
    const objectPath = command.input.Prefix
    return (async () => {
      try {
        await readFile(objectFile(objectPath, command.input.Bucket))
        return {
          $metadata: {},
          IsTruncated: false,
          Versions: [{ Key: objectPath, VersionId: '1' }],
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT')
          return { $metadata: {}, IsTruncated: false, Versions: [] }
        throw err
      }
    })()
  }
  if (
    command instanceof DeleteObjectsCommand &&
    command.input.Delete?.Objects?.length &&
    command.input.Delete.Objects.every(item => item.Key?.startsWith(PREFIX))
  ) {
    const objects = command.input.Delete.Objects
    return (async () => {
      for (const object of objects) {
        try {
          await unlink(objectFile(object.Key!, command.input.Bucket))
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
        }
      }
      return { $metadata: {}, Errors: [] }
    })()
  }
  return null
}
