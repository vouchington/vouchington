import { randomInt } from 'node:crypto'
import { advisoryLockPool, type PoolClient } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'

const DAY_MS = 24 * 60 * 60 * 1000
const TEST_AI_USAGE_WINDOW_START_MS = Date.parse('8000-01-01T00:00:00.000Z')
const TEST_AI_USAGE_WINDOW_END_MS = Date.parse('9000-01-01T00:00:00.000Z')
const TEST_AI_USAGE_MAX_LOCK_ATTEMPTS = 16
const TEST_AI_USAGE_CONTROL_SLOT = 16
const TEST_AI_USAGE_SLOT_DAYS = 3
// Keep the existing recyclable control window separate from ordinary fresh-day reservations.
const TEST_AI_USAGE_FIRST_ORDINARY_SLOT = TEST_AI_USAGE_CONTROL_SLOT + 1
const TEST_AI_USAGE_ORDINARY_SLOT_COUNT =
  Math.floor(
    (TEST_AI_USAGE_WINDOW_END_MS - TEST_AI_USAGE_WINDOW_START_MS) /
      (TEST_AI_USAGE_SLOT_DAYS * DAY_MS),
  ) - TEST_AI_USAGE_FIRST_ORDINARY_SLOT
const initialOrdinarySlotOffset = randomInt(TEST_AI_USAGE_ORDINARY_SLOT_COUNT)
let ordinarySlotAttempts = 0

export type TestAiUsageDateReservation = {
  day: string
  release(): Promise<void>
}

/**
 * Reserves a clean, three-day UUIDv7 window for an exact global ai-usage aggregate assertion.
 * Fresh ordinary windows are independently advisory-locked; no day is reused within this process.
 */
export async function acquireTestAiUsageDateReservation(): Promise<TestAiUsageDateReservation> {
  const client = await advisoryLockPool.connect()
  try {
    for (let attempt = 0; attempt < TEST_AI_USAGE_MAX_LOCK_ATTEMPTS; attempt++) {
      const slot = nextOrdinarySlot()
      if (await tryAcquireSlot(client, slot)) {
        await clearSlot(client, slot)
        return createReservation(client, slot)
      }
    }
    throw new Error(
      `No AI usage test date reservation was acquired after ${TEST_AI_USAGE_MAX_LOCK_ATTEMPTS} attempts`,
    )
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

/** Test-only deterministic slot; intentionally not exported from the test-helper barrel. */
export async function acquireTestAiUsageDateReservationControlSlot(): Promise<TestAiUsageDateReservation> {
  const client = await advisoryLockPool.connect()
  try {
    if (!(await tryAcquireSlot(client, TEST_AI_USAGE_CONTROL_SLOT))) {
      throw new Error('The AI usage test date reservation control slot is already in use')
    }
    await clearSlot(client, TEST_AI_USAGE_CONTROL_SLOT)
    return createReservation(client, TEST_AI_USAGE_CONTROL_SLOT)
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

function nextOrdinarySlot(): number {
  if (ordinarySlotAttempts >= TEST_AI_USAGE_ORDINARY_SLOT_COUNT) {
    throw new Error('The finite AI usage test date reservation range is exhausted')
  }
  const offset =
    (initialOrdinarySlotOffset + ordinarySlotAttempts++) % TEST_AI_USAGE_ORDINARY_SLOT_COUNT
  return TEST_AI_USAGE_FIRST_ORDINARY_SLOT + offset
}

async function tryAcquireSlot(client: PoolClient, slot: number): Promise<boolean> {
  const { rows } = await client.query<{ acquired: boolean }>(
    '/* acquireTestAiUsageDateReservation */ SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
    [lockName(slot)],
  )
  return rows.at(0)?.acquired ?? false
}

async function clearSlot(client: PoolClient, slot: number): Promise<void> {
  const { startBound, endBound } = getSlotBounds(slot)
  await client.query(
    '/* clearTestAiUsageDateReservation */ DELETE FROM ai_usage_records WHERE id >= $1 AND id < $2',
    [startBound, endBound],
  )
}

function createReservation(client: PoolClient, slot: number): TestAiUsageDateReservation {
  let releasePromise: Promise<void> | undefined
  return {
    day: getSlotDay(slot),
    release(): Promise<void> {
      releasePromise ??= releaseReservation(client, slot)
      return releasePromise
    },
  }
}

async function releaseReservation(client: PoolClient, slot: number): Promise<void> {
  try {
    await clearSlot(client, slot)
    const { rows } = await client.query<{ unlocked: boolean }>(
      '/* releaseTestAiUsageDateReservation */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
      [lockName(slot)],
    )
    if (!rows[0]?.unlocked) {
      throw new Error('PostgreSQL did not release the AI usage test date reservation')
    }
    client.release()
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

function getSlotDay(slot: number): string {
  return new Date(TEST_AI_USAGE_WINDOW_START_MS + (slot * TEST_AI_USAGE_SLOT_DAYS + 1) * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

function getSlotBounds(slot: number): { startBound: string; endBound: string } {
  const startMs = TEST_AI_USAGE_WINDOW_START_MS + slot * TEST_AI_USAGE_SLOT_DAYS * DAY_MS
  return {
    startBound: timestampToUuidv7LowerBound(startMs),
    endBound: timestampToUuidv7LowerBound(startMs + TEST_AI_USAGE_SLOT_DAYS * DAY_MS),
  }
}

function lockName(slot: number): string {
  return `ai-usage-test-date-reservation-${slot}`
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
