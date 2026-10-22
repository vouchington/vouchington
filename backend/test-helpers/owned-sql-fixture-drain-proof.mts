import { randomUUID } from 'node:crypto'
import { beginTransaction, read, writePool, type PoolClient } from '@data-stores/psql'
import { createOwnedSqlFixtureLifetime } from './owned-sql-fixture-lifetime.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'
import { insertTestRetainedIdentityRoot } from './entities/retained-identities.mts'
import { mintUUIDv7 } from '@modules/utils/ids'

/** Real blocked SQL, a later composite write, and the same leased connection's unlock evidence. */
export async function proveOwnedSqlFixtureDrain() {
  const reservationKey = `owned-sql-reservation-${randomUUID()}`
  const blockerKey = `owned-sql-blocker-${randomUUID()}`
  const id = mintUUIDv7()
  let client: PoolClient | undefined
  let transaction: Awaited<ReturnType<typeof beginTransaction>> | undefined
  let before: { pid: number; held: boolean } | undefined
  let after: { pid: number; held: boolean; unlocked: boolean } | undefined
  let operationSettled = false
  let closeSettled = false
  const owner = createOwnedSqlFixtureLifetime(async () => {
    const failures: unknown[] = []
    try {
      await transaction?.rollback()
    } catch (err) {
      failures.push(err)
    }
    try {
      await transaction?.[Symbol.asyncDispose]()
    } catch (err) {
      failures.push(err)
    }
    if (client) {
      try {
        const unlocked = await client.query<{ unlocked: boolean }>(
          '/* ownedSqlDrainProof.unlock */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [reservationKey],
        )
        const state = await readReservation(client, reservationKey)
        after = { ...state, unlocked: unlocked.rows[0]?.unlocked ?? false }
        if (!after.unlocked || after.held) throw new Error('Owned SQL reservation did not release')
      } catch (err) {
        failures.push(err)
      }
      client.release(
        failures.length
          ? new AggregateError(failures, 'Owned SQL resource release failed')
          : undefined,
      )
    }
    if (failures.length) throw new AggregateError(failures, 'Owned SQL resource release failed')
  })
  return owner.withBody(async () => {
    await owner.prepare(async () => {
      client = await writePool.connect()
      owner.assertOpen()
      await client.query(
        '/* ownedSqlDrainProof.reserve */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
        [reservationKey],
      )
      owner.assertOpen()
      before = await readReservation(client, reservationKey)
      owner.assertOpen()
      transaction = await beginTransaction({ client })
    })
    await using blocker = await beginTransaction()
    await blocker(
      '/* ownedSqlDrainProof.blocker */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [blockerKey],
    )
    const blockerPid = await getTestPostgresBackendProcessId(blocker)
    const operation = owner.run(async () => {
      await transaction!(
        '/* ownedSqlDrainProof.pending */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [blockerKey],
      )
      // The full admitted producer must remain usable after close starts, until this write finishes.
      await insertTestRetainedIdentityRoot('user', id, { query: transaction! })
      operationSettled = true
    })
    const outcomes = Promise.allSettled([operation])
    let closing: Promise<void> | undefined
    let heldWhilePending: boolean | undefined
    let operationPendingAtClose: boolean | undefined
    let finalizerPending: boolean | undefined
    try {
      await waitForTestPostgresLockWaiter(
        blockerPid,
        'ownedSqlDrainProof.pending',
        'advisoryLock',
        undefined,
        undefined,
        before!.pid,
      )
      closing = owner.close().then(() => {
        closeSettled = true
        return undefined
      })
      void closing.catch(() => {})
      operationPendingAtClose = !operationSettled
      heldWhilePending = await reservationHeld(reservationKey)
      finalizerPending = !closeSettled
    } finally {
      // Release the physical blocker BEFORE awaiting the producer; otherwise cleanup deadlocks.
      await blocker.rollback()
      await outcomes
    }
    await operation
    await closing
    let lateAdmissionRejected = false
    try {
      await owner.run(async () => {})
    } catch {
      lateAdmissionRejected = true
    }
    const { rows } = await read<{ present: boolean }>(
      '/* ownedSqlDrainProof.rolledBack */ SELECT EXISTS (SELECT 1 FROM retained_user_identities WHERE id = $1) AS present',
      [id],
    )
    const sibling = await writePool.connect()
    let siblingAcquired = false
    try {
      const result = await sibling.query<{ acquired: boolean }>(
        '/* ownedSqlDrainProof.sibling */ SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [reservationKey],
      )
      siblingAcquired = result.rows[0]?.acquired ?? false
    } finally {
      if (siblingAcquired)
        await sibling.query(
          '/* ownedSqlDrainProof.siblingRelease */ SELECT pg_advisory_unlock(hashtextextended($1, 0))',
          [reservationKey],
        )
      sibling.release()
    }
    return {
      before,
      after,
      operationPendingAtClose,
      heldWhilePending,
      finalizerPending,
      operationSettled,
      closeSettled,
      lateAdmissionRejected,
      rolledBack: !rows[0]?.present,
      siblingAcquired,
    }
  })
}

async function readReservation(client: PoolClient, key: string) {
  const { rows } = await client.query<{ pid: number; held: boolean }>(
    `/* ownedSqlDrainProof.state */ SELECT pg_backend_pid() AS pid, EXISTS (
      SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid()
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND objsubid = 1 AND classid::bigint = ((hashtextextended($1, 0) >> 32) & 4294967295)
      AND objid::bigint = (hashtextextended($1, 0) & 4294967295)) AS held`,
    [key],
  )
  if (!rows[0]) throw new Error('Owned reservation state was not returned')
  return rows[0]
}

async function reservationHeld(key: string) {
  const { rows } = await read<{ held: boolean }>(
    `/* ownedSqlDrainProof.held */ SELECT EXISTS (SELECT 1 FROM pg_locks
      WHERE locktype = 'advisory' AND granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND objsubid = 1 AND classid::bigint = ((hashtextextended($1, 0) >> 32) & 4294967295)
      AND objid::bigint = (hashtextextended($1, 0) & 4294967295)) AS held`,
    [key],
  )
  return rows[0]?.held ?? false
}
