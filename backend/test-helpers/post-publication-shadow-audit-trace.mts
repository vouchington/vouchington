import { writeSync } from 'node:fs'
import type { QueryExecutor } from '@data-stores/psql'
import { getUnexpectedAttachedTestWorkerQueueNames } from '../../test-helpers/glide-mq-vitest-internals.mts'

/** Bounded, payload-free evidence from this proof's real executor, never a history poll. */
export function createCheckpointProofTrace(lockKey: string) {
  const events: unknown[] = []
  let omittedEvents = 0
  let lastRejection: unknown
  function record(event: unknown) {
    if (events.length < 96) events.push(event)
    else omittedEvents += 1
  }
  return {
    guard<Query extends QueryExecutor>(query: Query): Query {
      return new Proxy(query, {
        apply(target, receiver, args: Parameters<Query>) {
          const input = args[0]
          const text = typeof input === 'string' ? input : input.text
          const tag =
            text
              .trimStart()
              .match(/^\/\*([\w: -]+)\*\//)?.[1]
              ?.trim() ?? 'unannotated'
          record({ tag, stage: 'started' })
          const pending: ReturnType<QueryExecutor> = Reflect.apply(target, receiver, args)
          return pending.then(
            value => {
              record({ tag, stage: 'fulfilled' })
              return value
            },
            (err: unknown) => {
              let code: string | null = null
              let codeUnreadable = false
              try {
                if (err && typeof err === 'object' && 'code' in err) {
                  const value: unknown = err.code
                  if (typeof value === 'string') code = value.slice(0, 10)
                }
              } catch {
                codeUnreadable = true
              }
              lastRejection = { tag, stage: 'rejected', code, codeUnreadable }
              record(lastRejection)
              throw err
            },
          )
        },
      })
    },
    async snapshot(stage: string, query: QueryExecutor) {
      const { rows } = await query<{
        pid: number
        xid: string | null
        isolation: string
        snapshot: string
        lock_held: boolean
      }>(
        `/* observeOwnedShadowCheckpointProof */
        SELECT pg_backend_pid() AS pid, pg_current_xact_id_if_assigned()::text AS xid,
          current_setting('transaction_isolation') AS isolation,
          pg_current_snapshot()::text AS snapshot,
          EXISTS (SELECT 1 FROM pg_locks WHERE pid = pg_backend_pid()
            AND locktype = 'advisory' AND granted AND mode = 'ExclusiveLock' AND objsubid = 1
            AND classid = ((hashtextextended($1, 0) >> 32) & 4294967295)::oid
            AND objid = (hashtextextended($1, 0) & 4294967295)::oid) AS lock_held`,
        [lockKey],
      )
      const row = rows[0]
      if (!row?.lock_held)
        throw new Error('Checkpoint proof snapshot requires its production session fence')
      const attachedWorkerQueueNames = await getUnexpectedAttachedTestWorkerQueueNames(new Set())
      record({
        stage,
        ...row,
        attachedWorkerQueueNames: attachedWorkerQueueNames.slice(0, 32),
        workerNamesTruncated: attachedWorkerQueueNames.length > 32,
        snapshot: row.snapshot.slice(0, 256),
        snapshotTruncated: row.snapshot.length > 256,
      })
    },
    flush() {
      writeSync(
        2,
        `[shadow-checkpoint-proof] ${JSON.stringify({ events, omittedEvents, lastRejection })}\n`,
      )
    },
  }
}
