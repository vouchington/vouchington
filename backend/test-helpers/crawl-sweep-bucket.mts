import { randomInt } from 'node:crypto'
import { writePool, type PoolClient } from '@data-stores/psql'

const LOCK_NAMESPACE = 2_135_061
const FIRST_BUCKET_DAYS = 29_000
const BUCKET_COUNT = 32_768 - FIRST_BUCKET_DAYS
const BUCKET_STEP = 953
const MAX_ATTEMPTS = 64

export type TestCrawlSweepBucket = AsyncDisposable & {
  days: number
  release(): Promise<void>
}

/** Reserve an empty retained-row bucket across concurrent dirty-database tests. */
export async function acquireTestCrawlSweepBucket({
  firstBucketDays,
}: { firstBucketDays?: number } = {}): Promise<TestCrawlSweepBucket> {
  if (
    firstBucketDays !== undefined &&
    (!Number.isInteger(firstBucketDays) ||
      firstBucketDays < FIRST_BUCKET_DAYS ||
      firstBucketDays >= FIRST_BUCKET_DAYS + BUCKET_COUNT)
  ) {
    throw new Error('First hostname sweep test bucket is outside the reserved SMALLINT band')
  }
  const client = await writePool.connect()
  try {
    const first =
      firstBucketDays === undefined ? randomInt(BUCKET_COUNT) : firstBucketDays - FIRST_BUCKET_DAYS
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const days = FIRST_BUCKET_DAYS + ((first + attempt * BUCKET_STEP) % BUCKET_COUNT)
      if (!(await tryLockBucket(client, days))) continue

      let keepLock = false
      try {
        const { rows } = await client.query<{ occupied: boolean }>(
          '/* acquireTestCrawlSweepBucket */ SELECT EXISTS (SELECT 1 FROM url_hostnames WHERE age_threshold_days = $1::smallint) AS occupied',
          [days],
        )
        if (rows[0]?.occupied ?? true) continue
        keepLock = true
        return createReservation(client, days)
      } finally {
        if (!keepLock) await unlockBucket(client, days)
      }
    }
    throw new Error(`No unused hostname sweep test bucket found after ${MAX_ATTEMPTS} attempts`)
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

async function tryLockBucket(client: PoolClient, days: number): Promise<boolean> {
  const { rows } = await client.query<{ acquired: boolean }>(
    '/* acquireTestCrawlSweepBucket */ SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired',
    [LOCK_NAMESPACE, days],
  )
  return rows[0]?.acquired ?? false
}

async function unlockBucket(client: PoolClient, days: number): Promise<void> {
  const { rows } = await client.query<{ unlocked: boolean }>(
    '/* releaseTestCrawlSweepBucket */ SELECT pg_advisory_unlock($1::integer, $2::integer) AS unlocked',
    [LOCK_NAMESPACE, days],
  )
  if (!rows[0]?.unlocked) throw new Error('PostgreSQL did not release a hostname sweep test bucket')
}

function createReservation(client: PoolClient, days: number): TestCrawlSweepBucket {
  let releasePromise: Promise<void> | undefined
  const release = (): Promise<void> => {
    releasePromise ??= (async () => {
      try {
        await unlockBucket(client, days)
        client.release()
      } catch (err) {
        client.release(toError(err))
        throw err
      }
    })()
    return releasePromise
  }
  return { days, release, [Symbol.asyncDispose]: release }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
