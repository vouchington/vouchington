import { afterEach, beforeEach } from 'vitest'
import { advisoryLockPool, type PoolClient } from '@data-stores/psql'

const WRITER_ADVISORY_LOCK_NAME = 'serializable-writer-subject-tests'
// Below the 5s hook cap, so a stalled queue fails the hook instead of acquiring the lock late.
const LOCK_STATEMENT_TIMEOUT = '4s'

type SerializableWriterReservation = { release(): Promise<void> }

/**
 * Serializes the tests whose subject is a SERIALIZABLE writer (membership grant writer, Stripe
 * catalog publisher) across every worker and every vitest process sharing the database. SSI tracks
 * reads at btree-page granularity, and these writers read and insert through the same few hot index
 * pages (UUIDv7 keys land on the rightmost leaf), so two concurrent writers for unrelated users
 * abort each other with 40001. The writer keeps its SERIALIZABLE contract; only the tests that
 * assert it queue behind each other. Races inside one test still run concurrently.
 */
export function isolateSerializableWriterTests(): void {
  let reservation: SerializableWriterReservation | undefined
  beforeEach(async () => {
    reservation = await acquireSerializableWriterReservation()
  })
  afterEach(async () => {
    const held = reservation
    reservation = undefined
    await held?.release()
  })
}

async function acquireSerializableWriterReservation(): Promise<SerializableWriterReservation> {
  const client = await advisoryLockPool.connect()
  try {
    const setting = await client.query<{ statement_timeout: string }>(
      '/* acquireSerializableWriterReservation.readTimeout */ SHOW statement_timeout',
    )
    const previousTimeout = setting.rows[0]?.statement_timeout
    await client.query(
      '/* acquireSerializableWriterReservation.setTimeout */ SELECT set_config($1, $2, false)',
      ['statement_timeout', LOCK_STATEMENT_TIMEOUT],
    )
    await client.query(
      '/* acquireSerializableWriterReservation */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [WRITER_ADVISORY_LOCK_NAME],
    )
    if (previousTimeout !== undefined)
      await client.query(
        '/* acquireSerializableWriterReservation.restoreTimeout */ SELECT set_config($1, $2, false)',
        ['statement_timeout', previousTimeout],
      )
  } catch (err) {
    client.release(toError(err))
    throw err
  }
  return { release: () => releaseReservation(client) }
}

async function releaseReservation(client: PoolClient): Promise<void> {
  try {
    const { rows } = await client.query<{ unlocked: boolean }>(
      '/* releaseSerializableWriterReservation */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
      [WRITER_ADVISORY_LOCK_NAME],
    )
    if (!rows[0]?.unlocked)
      throw new Error('PostgreSQL did not release the serializable writer reservation')
    client.release()
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
