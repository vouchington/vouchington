import { randomInt } from 'node:crypto'
import { writePool, type PoolClient } from '@data-stores/psql'

const FIRST_YEAR = 3003
const SLOT_YEARS = 4
const SLOT_COUNT = 1749 // Last slot is in 9995, below the ISO year and UUIDv7 limits.
const initialSlotOffset = randomInt(SLOT_COUNT)
let nextSlotOffset = 0

export type TestModerationTransparencyDateReservation = {
  now: Date
  release(): Promise<void>
}

/**
 * Gives each test an empty 37-month projection window without deleting immutable disclosures.
 * A per-slot session lock makes the empty-window check atomic across parallel test processes.
 * Four-year slots cannot overlap, and occupied slots are never reused.
 */
export async function acquireTestModerationTransparencyDateReservation(): Promise<TestModerationTransparencyDateReservation> {
  const client = await writePool.connect()
  try {
    while (nextSlotOffset < SLOT_COUNT) {
      const slot = (initialSlotOffset + nextSlotOffset++) % SLOT_COUNT
      const { rows: lockRows } = await client.query<{ acquired: boolean }>(
        '/* acquireTestModerationTransparencyDateReservation */ SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [lockName(slot)],
      )
      if (!lockRows[0]?.acquired) continue
      const { rows } = await client.query<{ occupied: boolean }>(
        `/* checkTestModerationTransparencyDateSlot */
        SELECT EXISTS (
          SELECT 1 FROM moderation_transparency_released_daily_rollups
          WHERE day >= make_date($1::integer + $2::integer * $3::integer - 3, 1, 1)
            AND day < make_date($1::integer + $2::integer * $3::integer + 1, 1, 1)
        ) OR EXISTS (
          SELECT 1 FROM moderation_transparency_daily_rollups
          WHERE day >= make_date($1::integer + $2::integer * $3::integer - 3, 1, 1)
            AND day < make_date($1::integer + $2::integer * $3::integer + 1, 1, 1)
        ) AS occupied`,
        [FIRST_YEAR, SLOT_YEARS, slot],
      )
      if (!rows[0]?.occupied) return createReservation(client, slot)
      await client.query(
        '/* releaseOccupiedTestModerationTransparencyDateSlot */ SELECT pg_advisory_unlock(hashtextextended($1, 0))',
        [lockName(slot)],
      )
    }
    throw new Error('No unused moderation transparency test date slot remains')
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

/** Proves mutual exclusion: fails to acquire the reservation's advisory lock from a second session. */
export async function isTestModerationTransparencyLockHeldByAnotherSession(
  now: Date,
): Promise<boolean> {
  const observer = await writePool.connect()
  const slot = (now.getUTCFullYear() - FIRST_YEAR) / SLOT_YEARS
  const key = lockName(slot)
  try {
    const { rows } = await observer.query<{ acquired: boolean }>(
      '/* isTestModerationTransparencyLockHeldByAnotherSession */ SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      [key],
    )
    const acquired = rows[0]?.acquired ?? false
    if (acquired) {
      await observer.query(
        '/* isTestModerationTransparencyLockHeldByAnotherSession release */ SELECT pg_advisory_unlock(hashtextextended($1, 0))',
        [key],
      )
    }
    return !acquired
  } finally {
    observer.release()
  }
}

function createReservation(
  client: PoolClient,
  slot: number,
): TestModerationTransparencyDateReservation {
  let releasePromise: Promise<void> | undefined
  return {
    now: new Date(Date.UTC(FIRST_YEAR + SLOT_YEARS * slot, 0, 15, 12)),
    release(): Promise<void> {
      releasePromise ??= releaseReservation(client, slot)
      return releasePromise
    },
  }
}

async function releaseReservation(client: PoolClient, slot: number): Promise<void> {
  try {
    const { rows } = await client.query<{ unlocked: boolean }>(
      '/* releaseTestModerationTransparencyDateReservation */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
      [lockName(slot)],
    )
    if (!rows[0]?.unlocked) throw new Error('PostgreSQL did not release the reserved test window')
    client.release()
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

function lockName(slot: number): string {
  return `moderation-transparency-test-date-slot-${slot}`
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
