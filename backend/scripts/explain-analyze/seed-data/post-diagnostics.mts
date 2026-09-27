import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool, type PoolClient } from '@data-stores/psql'
import { resolveDatabaseConnectionString } from '@data-stores/psql/connection-string-env'
import { withLibpqCompat } from '@data-stores/psql/connection-string-utils'
import { assertNotCrossWorktreeConnection } from '@data-stores/psql/worktree-guard'

type CumulativeStats = { wal: Record<string, unknown>; checkpointer: Record<string, unknown> }
export type SeedBackend = {
  pid: number
  jit: string
  work_mem: string
  plan_cache_mode: string
  server_version: string
}

export class PostSeedDiagnostics {
  readonly path: string
  readonly #controller = new AbortController()
  #observer: Promise<void> | undefined
  #writeErrorReported = false

  constructor(path = join(import.meta.dirname, '..', 'output', 'seed-posts.jsonl')) {
    this.path = path
    try {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, '')
    } catch (error) {
      this.#reportWriteError(error)
    }
    this.write({ kind: 'seed_start' })
  }

  startObserver(backend: SeedBackend): void {
    this.write({ kind: 'backend', backend_pid: backend.pid, settings: backend })
    this.#observer = this.#observe(backend.pid).catch(error => {
      this.write({ kind: 'observer_error', error: String(error) })
    })
  }

  write(record: Record<string, unknown>): void {
    try {
      appendFileSync(this.path, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`)
    } catch (error) {
      this.#reportWriteError(error)
    }
  }

  async operation<T>(
    name: string,
    batchIndex: number | null,
    action: () => Promise<T>,
  ): Promise<T> {
    const started = performance.now()
    this.write({ kind: 'operation', phase: 'begin', name, batch_index: batchIndex })
    try {
      const result = await action()
      this.write({
        kind: 'operation',
        phase: 'end',
        name,
        batch_index: batchIndex,
        elapsed_ms: Math.round((performance.now() - started) * 1000) / 1000,
        status: 'ok',
      })
      return result
    } catch (error) {
      this.write({
        kind: 'operation',
        phase: 'end',
        name,
        batch_index: batchIndex,
        elapsed_ms: Math.round((performance.now() - started) * 1000) / 1000,
        status: 'error',
        error: String(error),
      })
      throw error
    }
  }

  async stop(): Promise<void> {
    this.#controller.abort()
    await this.#observer
    this.write({ kind: 'seed_end' })
  }

  async #observe(backendPid: number): Promise<void> {
    const connectionString = withLibpqCompat(resolveDatabaseConnectionString())
    assertNotCrossWorktreeConnection(connectionString)
    const pool = new Pool({
      connectionString,
      application_name: 'explain_seed_observer',
      max: 1,
      connectionTimeoutMillis: 1_500,
      query_timeout: 1_000,
      statement_timeout: 1_000,
    })
    pool.on('error', error => this.write({ kind: 'observer_error', error: String(error) }))
    let client: PoolClient | undefined
    let startStats: CumulativeStats | undefined
    try {
      client = await pool.connect()
      client.on('error', error => this.write({ kind: 'observer_error', error: String(error) }))
      const { rows: observerRows } = await client.query<{ pid: number }>(
        '/* explainSeedObserverPid */ SELECT pg_backend_pid() AS pid',
      )
      this.write({ kind: 'observer_connected', observer_pid: observerRows[0].pid })
      startStats = await this.#stats(client)
      this.write({ kind: 'cumulative_start', ...startStats })
      while (!this.#controller.signal.aborted) {
        const result = await client.query<{
          state: string | null
          wait_event_type: string | null
          wait_event: string | null
          blockers: number[]
          query_age_ms: number | null
          transaction_age_ms: number | null
          query: string | null
        }>(
          `/* explainSeedObserverActivity */ SELECT state, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers,
                  (EXTRACT(EPOCH FROM clock_timestamp() - query_start) * 1000)::double precision AS query_age_ms,
                  (EXTRACT(EPOCH FROM clock_timestamp() - xact_start) * 1000)::double precision AS transaction_age_ms,
                  left(query, 240) AS query
           FROM pg_stat_activity WHERE pid = $1`,
          [backendPid],
        )
        this.write({ kind: 'activity', backend_pid: backendPid, ...result.rows[0] })
        try {
          await delay(2_000, undefined, { signal: this.#controller.signal })
        } catch (error) {
          if (!this.#controller.signal.aborted) throw error
        }
      }
      const endStats = await this.#stats(client)
      this.write({
        kind: 'cumulative_end',
        ...endStats,
        delta: startStats && {
          wal: numericDelta(startStats.wal, endStats.wal),
          checkpointer: numericDelta(startStats.checkpointer, endStats.checkpointer),
        },
      })
    } catch (error) {
      this.write({ kind: 'observer_error', error: String(error) })
    } finally {
      client?.release()
      try {
        await pool.end()
      } catch (error) {
        this.write({ kind: 'observer_error', error: String(error) })
      }
    }
  }

  async #stats(client: PoolClient): Promise<CumulativeStats> {
    const result = await client.query<CumulativeStats>(
      `/* explainSeedObserverCounters */ SELECT (SELECT to_jsonb(w) FROM pg_stat_wal AS w) AS wal,
              (SELECT to_jsonb(c) FROM pg_stat_checkpointer AS c) AS checkpointer`,
    )
    return result.rows[0]
  }

  #reportWriteError(error: unknown): void {
    if (this.#writeErrorReported) return
    this.#writeErrorReported = true
    console.error('Could not write post seed diagnostics:', error)
  }
}

function numericDelta(start: Record<string, unknown>, end: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(end)
      .filter(([key, value]) => typeof value === 'number' && typeof start[key] === 'number')
      .map(([key, value]) => [key, (value as number) - (start[key] as number)]),
  )
}
