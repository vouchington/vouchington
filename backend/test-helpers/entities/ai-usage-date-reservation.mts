import { randomInt } from 'node:crypto'
import { advisoryLockPool, type PoolClient } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'

const DAY_MS = 24 * 60 * 60 * 1000
const SLOT_DAYS = 3
const SLOT_MS = SLOT_DAYS * DAY_MS
const CONTROL_SLOT_STRIDE = 7
const { controlSlot, ordinarySlots } = getTestAiUsageSlotGridForDate(new Date())
let ordinarySlotCursor = randomInt(ordinarySlots.length)

/** Absolute UTC slots give separate processes the same lock key across a month boundary. */
export function getTestAiUsageSlotGridForDate(date: Date): {
  controlSlot: number
  ordinarySlots: number[]
} {
  // All three months are in the bootstrap range; active wall-clock days are excluded below.
  const windowStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)
  const windowEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 1)
  const firstSlot = Math.ceil(windowStart / SLOT_MS)
  const endSlot = Math.floor(windowEnd / SLOT_MS)
  const slots = Array.from({ length: endSlot - firstSlot }, (_, offset) => firstSlot + offset)
  const controlSlot = slots.find(slot => slot % CONTROL_SLOT_STRIDE === 0)
  if (controlSlot === undefined) throw new Error('AI usage date window has no control slot')
  return {
    controlSlot,
    ordinarySlots: slots.filter(slot => slot % CONTROL_SLOT_STRIDE !== 0),
  }
}

export type TestAiUsageDateReservation = {
  day: string
  release(): Promise<void>
}

/** Reserve a clean three-day window in the prepared next-month child for exact daily totals. */
export async function acquireTestAiUsageDateReservation(
  options: { notBefore?: Date } = {},
): Promise<TestAiUsageDateReservation> {
  const client = await advisoryLockPool.connect()
  try {
    for (let attempt = 0; attempt < ordinarySlots.length; attempt++) {
      const index = (ordinarySlotCursor + attempt) % ordinarySlots.length
      const slot = ordinarySlots[index]!
      if (
        options.notBefore &&
        Date.parse(`${getSlotDay(slot)}T12:00:00.000Z`) < options.notBefore.getTime()
      )
        continue
      if (!(await tryAcquireSlot(client, slot))) continue
      if (await slotIsClean(client, slot)) {
        ordinarySlotCursor = (index + 1) % ordinarySlots.length
        return createReservation(client, slot)
      }
      await releaseSlotLock(client, slot)
    }
    throw new Error(`No clean AI usage date reservation in ${ordinarySlots.length} slots`)
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

/** Test-only deterministic slot; intentionally not exported from the helper barrel. */
export async function acquireTestAiUsageDateReservationControlSlot(): Promise<TestAiUsageDateReservation> {
  const client = await advisoryLockPool.connect()
  try {
    if (!(await tryAcquireSlot(client, controlSlot))) {
      throw new Error('The AI usage test date reservation control slot is already in use')
    }
    if (!(await slotIsClean(client, controlSlot))) {
      throw new Error('The AI usage test date reservation control slot contains foreign rows')
    }
    return createReservation(client, controlSlot)
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

async function tryAcquireSlot(client: PoolClient, slot: number): Promise<boolean> {
  const { rows } = await client.query<{ acquired: boolean }>(
    '/* acquireTestAiUsageDateReservation */ SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
    [lockName(slot)],
  )
  return rows.at(0)?.acquired ?? false
}

async function slotIsClean(client: PoolClient, slot: number): Promise<boolean> {
  const startMs = slot * SLOT_MS
  if (startMs < Date.now() + DAY_MS && startMs + SLOT_DAYS * DAY_MS > Date.now() - DAY_MS) {
    return false
  }
  const { startBound, endBound } = getSlotBounds(slot)
  const { rows } = await client.query<{ empty: boolean }>(
    '/* acquireTestAiUsageDateReservation:empty */ SELECT NOT EXISTS (SELECT 1 FROM ai_usage_records WHERE id >= $1 AND id < $2 LIMIT 1) AS empty',
    [startBound, endBound],
  )
  return rows[0]?.empty ?? false
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
    await releaseSlotLock(client, slot)
    client.release()
  } catch (err) {
    client.release(toError(err))
    throw err
  }
}

async function releaseSlotLock(client: PoolClient, slot: number): Promise<void> {
  const { rows } = await client.query<{ unlocked: boolean }>(
    '/* releaseTestAiUsageDateReservation */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
    [lockName(slot)],
  )
  if (!rows[0]?.unlocked)
    throw new Error('PostgreSQL did not release the AI usage date reservation')
}

function getSlotDay(slot: number): string {
  return new Date(slot * SLOT_MS + DAY_MS).toISOString().slice(0, 10)
}

function getSlotBounds(slot: number): { startBound: string; endBound: string } {
  const startMs = slot * SLOT_MS
  return {
    startBound: timestampToUuidv7LowerBound(startMs),
    endBound: timestampToUuidv7LowerBound(startMs + SLOT_DAYS * DAY_MS),
  }
}

function lockName(slot: number): string {
  return `ai-usage-test-date-reservation-${slot}`
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
