import { randomInt } from 'node:crypto'
import { advisoryLockPool, read, write, type PoolClient } from '@data-stores/psql'
import sql from 'sql-template-strings'

// URL-less crawl fixtures park hostnames in 29000–32699. A one-row sweep counts the
// earliest url-less row in its bucket as a probe, so exclusive tests stay below that band.
const EXCLUSIVE_HOSTNAME_SWEEP_BUCKET_START = 8000
const EXCLUSIVE_HOSTNAME_SWEEP_BUCKET_COUNT = 2000
const EXCLUSIVE_HOSTNAME_SWEEP_BUCKET_ATTEMPTS = 16
const heldHostnameSweepBuckets = new Set<number>()

export async function setTestHostnameCrawlSweep(id: string, days: number, sweptAt: string | null) {
  await write(sql`/* setTestHostnameCrawlSweep */ UPDATE url_hostnames
    SET age_threshold_days = ${days}, crawl_swept_at = ${sweptAt}::timestamptz WHERE id = ${id}::uuid`)
}

export async function getTestHostnameCrawlSweep(id: string) {
  const { rows } = await read<{ crawl_swept_at: string | null }>(sql`/* getTestHostnameCrawlSweep */
    SELECT crawl_swept_at::text FROM url_hostnames WHERE id = ${id}::uuid`)
  const value = rows[0]?.crawl_swept_at
  return value ? new Date(value).toISOString() : null
}

export type TestHostnameSweepBucket = {
  bucketDays: number
  release(): Promise<void>
}

/** Reserves one age_threshold_days value that no shared-band fixture occupies. */
export async function acquireTestHostnameSweepBucket(): Promise<TestHostnameSweepBucket> {
  const client = await advisoryLockPool.connect()
  let lockedBucket: number | undefined
  try {
    for (let attempt = 0; attempt < EXCLUSIVE_HOSTNAME_SWEEP_BUCKET_ATTEMPTS; attempt++) {
      const bucketDays =
        EXCLUSIVE_HOSTNAME_SWEEP_BUCKET_START + randomInt(EXCLUSIVE_HOSTNAME_SWEEP_BUCKET_COUNT)
      if (heldHostnameSweepBuckets.has(bucketDays)) continue
      if (!(await tryAcquireHostnameSweepBucket(client, bucketDays))) continue
      lockedBucket = bucketDays
      heldHostnameSweepBuckets.add(bucketDays)
      await clearHostnameSweepBucket(client, bucketDays)
      return createHostnameSweepBucket(client, bucketDays)
    }
    throw new Error(
      `No hostname sweep bucket was acquired after ${EXCLUSIVE_HOSTNAME_SWEEP_BUCKET_ATTEMPTS} attempts`,
    )
  } catch (err) {
    if (lockedBucket !== undefined) heldHostnameSweepBuckets.delete(lockedBucket)
    client.release(toError(err))
    throw err
  }
}

async function tryAcquireHostnameSweepBucket(
  client: PoolClient,
  bucketDays: number,
): Promise<boolean> {
  const { rows } = await client.query<{ acquired: boolean }>(
    '/* acquireTestHostnameSweepBucket */ SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
    [hostnameSweepBucketLockName(bucketDays)],
  )
  return rows[0]?.acquired ?? false
}

async function clearHostnameSweepBucket(client: PoolClient, bucketDays: number): Promise<void> {
  await client.query(
    '/* clearTestHostnameSweepBucket */ UPDATE url_hostnames SET age_threshold_days = 1 WHERE age_threshold_days = $1',
    [bucketDays],
  )
}

function createHostnameSweepBucket(
  client: PoolClient,
  bucketDays: number,
): TestHostnameSweepBucket {
  let releasePromise: Promise<void> | undefined
  return {
    bucketDays,
    release(): Promise<void> {
      releasePromise ??= releaseHostnameSweepBucket(client, bucketDays)
      return releasePromise
    },
  }
}

async function releaseHostnameSweepBucket(client: PoolClient, bucketDays: number): Promise<void> {
  try {
    await clearHostnameSweepBucket(client, bucketDays)
    const { rows } = await client.query<{ unlocked: boolean }>(
      '/* releaseTestHostnameSweepBucket */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
      [hostnameSweepBucketLockName(bucketDays)],
    )
    if (!rows[0]?.unlocked) {
      throw new Error('PostgreSQL did not release the hostname sweep bucket')
    }
    heldHostnameSweepBuckets.delete(bucketDays)
    client.release()
  } catch (err) {
    heldHostnameSweepBuckets.delete(bucketDays)
    client.release(toError(err))
    throw err
  }
}

function hostnameSweepBucketLockName(bucketDays: number): string {
  return `hostname-sweep-bucket-${bucketDays}`
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
