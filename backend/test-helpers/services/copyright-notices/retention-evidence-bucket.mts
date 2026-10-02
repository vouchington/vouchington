import { DeleteObjectsCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, vi } from 'vitest'

const BUCKET = 'test-copyright-evidence'
const PAGE_SIZE = 2

type StoredVersion = { versionId: string; deleteMarker: boolean }

export type FakeEvidenceBucket = {
  /** Stores `versions` object versions of `key`, newest first, plus a delete marker on top if asked. */
  put(key: string, options?: { versions?: number; deleteMarker?: boolean }): void
  /** How many versions and delete markers of `key` the bucket still holds. */
  countVersions(key: string): number
  /** `DeleteObjects` answers 200 with an `Errors` entry for every version of `key`. */
  refuse(key: string): void
  allow(key: string): void
  /** Number of `DeleteObjects` requests the sweep has sent. */
  deleteRequests(): number
}

/**
 * A versioned evidence bucket behind the shared S3 client: only the two calls the retention sweep
 * makes are answered, listings page two entries at a time, and `DeleteObjects` honours
 * `VersionId` and reports refusals the way S3 does. The bucket env is set for the test.
 */
export function useFakeCopyrightEvidenceBucket(): FakeEvidenceBucket {
  const objects = new Map<string, StoredVersion[]>()
  const refused = new Set<string>()
  let deleteCalls = 0
  let nextVersion = 0

  beforeEach(() => {
    objects.clear()
    refused.clear()
    deleteCalls = 0
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', BUCKET)
    vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: unknown) => {
      if (command instanceof ListObjectVersionsCommand) return list(command.input)
      if (command instanceof DeleteObjectsCommand) return remove(command.input)
      throw new Error('Unexpected S3 command in the retention sweep')
    }) as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  function list(input: { Bucket?: string; Prefix?: string; VersionIdMarker?: string }) {
    expectBucket(input.Bucket)
    const entries = [...objects.entries()]
      .filter(([key]) => key.startsWith(input.Prefix ?? ''))
      .toSorted(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, versions]) => versions.map(version => ({ key, ...version })))
    const start = input.VersionIdMarker ? Number(input.VersionIdMarker) : 0
    const page = entries.slice(start, start + PAGE_SIZE)
    const truncated = start + PAGE_SIZE < entries.length
    const Versions: { Key: string; VersionId: string }[] = []
    const DeleteMarkers: { Key: string; VersionId: string }[] = []
    for (const entry of page) {
      const identifier = { Key: entry.key, VersionId: entry.versionId }
      if (entry.deleteMarker) DeleteMarkers.push(identifier)
      else Versions.push(identifier)
    }
    return {
      IsTruncated: truncated,
      NextKeyMarker: truncated ? page.at(-1)?.key : undefined,
      NextVersionIdMarker: truncated ? String(start + PAGE_SIZE) : undefined,
      Versions,
      DeleteMarkers,
    }
  }

  function remove(input: {
    Bucket?: string
    Delete?: { Objects?: { Key?: string; VersionId?: string }[] }
  }) {
    expectBucket(input.Bucket)
    deleteCalls += 1
    const errors: { Key: string; VersionId?: string; Code: string }[] = []
    for (const { Key, VersionId } of input.Delete?.Objects ?? []) {
      if (!Key || !VersionId) throw new Error('A versioned delete needs a key and a version id')
      if (refused.has(Key)) {
        errors.push({ Key, VersionId, Code: 'AccessDenied' })
        continue
      }
      const remaining = (objects.get(Key) ?? []).filter(entry => entry.versionId !== VersionId)
      if (remaining.length > 0) objects.set(Key, remaining)
      else objects.delete(Key)
    }
    return { Errors: errors }
  }

  return {
    put(key, options = {}) {
      const versions: StoredVersion[] = Array.from({ length: options.versions ?? 1 }, () => ({
        versionId: `version-${(nextVersion += 1)}`,
        deleteMarker: false,
      }))
      if (options.deleteMarker) {
        versions.unshift({ versionId: `version-${(nextVersion += 1)}`, deleteMarker: true })
      }
      objects.set(key, [...(objects.get(key) ?? []), ...versions])
    },
    countVersions: key => objects.get(key)?.length ?? 0,
    refuse: key => void refused.add(key),
    allow: key => void refused.delete(key),
    deleteRequests: () => deleteCalls,
  }
}

function expectBucket(bucket: string | undefined): void {
  if (bucket !== BUCKET) throw new Error('The sweep used the wrong bucket')
}
