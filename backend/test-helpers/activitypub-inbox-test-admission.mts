import { writePool } from '@data-stores/psql'
import type { PoolClient } from '@data-stores/psql/types'

const ADMISSION_LOCK_NAME = 'activitypub-inbox-test-admission'

type AdmissionLockSnapshot = Readonly<{ backendPid: number; held: boolean }>
export type ActivityPubInboxTestAdmissionEvidence = Readonly<{
  acquired: AdmissionLockSnapshot
  released?: AdmissionLockSnapshot & Readonly<{ unlocked: boolean }>
}>

export type ActivityPubInboxTestAdmission = {
  readonly evidence: ActivityPubInboxTestAdmissionEvidence
  release(): Promise<void>
}

/** Coordinate whole test lifetimes using the existing SQL deadline and real counter admission. */
export async function acquireActivityPubInboxTestAdmission(
  mode: 'ordinary' | 'capacity',
): Promise<ActivityPubInboxTestAdmission> {
  const client = await writePool.connect()
  let acquired: AdmissionLockSnapshot
  try {
    if (mode === 'capacity') {
      await client.query(
        '/* acquireActivityPubInboxTestAdmission.exclusive */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
        [ADMISSION_LOCK_NAME],
      )
    } else {
      await client.query(
        '/* acquireActivityPubInboxTestAdmission.shared */ SELECT pg_advisory_lock_shared(hashtextextended($1, 0))',
        [ADMISSION_LOCK_NAME],
      )
    }
    acquired = await captureAdmissionLock(client)
    if (!acquired.held) throw new Error('PostgreSQL ActivityPub test admission is not held')
  } catch (err) {
    client.release(toError(err))
    throw err
  }

  let evidence: ActivityPubInboxTestAdmissionEvidence = Object.freeze({ acquired })
  let releasePromise: Promise<void> | undefined
  return {
    get evidence() {
      return evidence
    },
    release() {
      releasePromise ??= release()
      return releasePromise
    },
  }

  async function release(): Promise<void> {
    try {
      const query =
        mode === 'capacity'
          ? '/* acquireActivityPubInboxTestAdmission.unlockExclusive */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked'
          : '/* acquireActivityPubInboxTestAdmission.unlockShared */ SELECT pg_advisory_unlock_shared(hashtextextended($1, 0)) AS unlocked'
      const result = await client.query<{ unlocked: boolean }>(query, [ADMISSION_LOCK_NAME])
      if (!result.rows[0]?.unlocked)
        throw new Error('PostgreSQL did not release ActivityPub test admission')
      const released = await captureAdmissionLock(client)
      if (released.backendPid !== acquired.backendPid || released.held)
        throw new Error('PostgreSQL ActivityPub test admission remained held after unlock')
      evidence = Object.freeze({
        acquired,
        released: Object.freeze({ ...released, unlocked: result.rows[0].unlocked }),
      })
      client.release()
    } catch (err) {
      client.release(toError(err))
      throw err
    }
  }
}

async function captureAdmissionLock(client: PoolClient): Promise<AdmissionLockSnapshot> {
  const { rows } = await client.query<{ backend_pid: number; held: boolean }>(
    `/* activityPubInboxTestAdmission.capture */
    WITH admission AS (SELECT hashtextextended($1, 0) AS lock_key)
    SELECT pg_backend_pid() AS backend_pid, EXISTS (
      SELECT 1 FROM pg_locks, admission
      WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND classid::bigint = ((lock_key >> 32) & 4294967295)
        AND objid::bigint = (lock_key & 4294967295) AND objsubid = 1
    ) AS held`,
    [ADMISSION_LOCK_NAME],
  )
  const row = rows[0]
  if (!row || !Number.isInteger(row.backend_pid) || typeof row.held !== 'boolean')
    throw new Error('PostgreSQL did not return ActivityPub admission lock evidence')
  return Object.freeze({ backendPid: row.backend_pid, held: row.held })
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
