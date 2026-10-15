import type { PoolClient } from '@data-stores/psql'

type Settings = {
  log_lock_waits: string
  deadlock_timeout: string
  client_min_messages: string
  statement_timeout: string
  application_name: string
}

/** Observe one real reserved connection; PostgreSQL emits this LOG while its lock is still blocked. */
export function observeTestAdvisoryLockNotice(client: PoolClient, lockTag: string) {
  const noticed = Promise.withResolvers<void>()
  let processId: number | undefined
  let original: Settings | undefined
  let closing: Promise<void> | undefined
  const applicationName = `copyright-lock-${crypto.randomUUID()}`
  const notice = (event: { message?: string }) => {
    if (
      processId !== undefined &&
      event.message?.startsWith(
        `process ${processId} still waiting for ExclusiveLock on ${lockTag} after `,
      )
    )
      noticed.resolve()
  }
  client.on('notice', notice)
  const ready = Promise.resolve().then(async () => {
    const { rows } = await client.query<
      Settings & {
        process_id: number
        version: number
        locale: string
        timeout_ms: number
        can_log: boolean
        can_set_deadlock: boolean
      }
    >(`/* observeTestAdvisoryLockNotice.settings */
      SELECT pg_backend_pid()::integer AS process_id,
        current_setting('server_version_num')::integer AS version,
        current_setting('lc_messages') AS locale,
        current_setting('log_lock_waits') AS log_lock_waits,
        current_setting('deadlock_timeout') AS deadlock_timeout,
        current_setting('client_min_messages') AS client_min_messages,
        current_setting('statement_timeout') AS statement_timeout,
        current_setting('application_name') AS application_name,
        (SELECT setting::integer FROM pg_settings WHERE name = 'statement_timeout') AS timeout_ms,
        has_parameter_privilege(current_user, 'log_lock_waits', 'SET') AS can_log,
        has_parameter_privilege(current_user, 'deadlock_timeout', 'SET') AS can_set_deadlock
    `)
    const row = rows[0]
    if (!row) throw new Error('Owned contender did not report its session settings')
    original = row
    processId = row.process_id
    if (row.version < 180000 || row.version >= 190000 || !row.can_log || !row.can_set_deadlock)
      throw new Error(
        'Owned lock-wait observation requires PostgreSQL18 and session SET privileges',
      )
    if (!/^(C|POSIX|en_)/.test(row.locale))
      throw new Error('Owned lock-wait observation requires the normal English PostgreSQL notices')
    if (row.timeout_ms > 0 && row.timeout_ms < 1000)
      throw new Error(
        `Owned contender has insufficient statement-timeout headroom: ${row.timeout_ms}`,
      )
    await client.query(
      `/* observeTestAdvisoryLockNotice.configure */
      SELECT set_config('log_lock_waits', 'on', false),
        set_config('deadlock_timeout', '100ms', false),
        set_config('client_min_messages', 'log', false),
        set_config('statement_timeout', $1, false),
        set_config('application_name', $2, false)
    `,
      [String(row.timeout_ms === 0 ? 5000 : Math.min(row.timeout_ms, 5000)), applicationName],
    )
    return { processId, applicationName }
  })
  return {
    ready,
    async wait(settled: Promise<PromiseSettledResult<unknown>[]>) {
      await ready
      await Promise.race([
        noticed.promise,
        settled.then(([result]) => {
          if (result?.status === 'rejected') {
            const failure = Promise.withResolvers<never>()
            failure.reject(result.reason)
            return failure.promise
          }
          throw new Error('Owned action settled without reaching its author lock')
        }),
      ])
    },
    close() {
      return (closing ??= (async () => {
        await Promise.allSettled([ready])
        client.off('notice', notice)
        if (original) {
          const { rows } = await client.query<Settings>(
            `/* observeTestAdvisoryLockNotice.restore */
            SELECT set_config('log_lock_waits', $1, false) AS log_lock_waits,
              set_config('deadlock_timeout', $2, false) AS deadlock_timeout,
              set_config('client_min_messages', $3, false) AS client_min_messages,
              set_config('statement_timeout', $4, false) AS statement_timeout,
              set_config('application_name', $5, false) AS application_name
          `,
            [
              original.log_lock_waits,
              original.deadlock_timeout,
              original.client_min_messages,
              original.statement_timeout,
              original.application_name,
            ],
          )
          for (const key of [
            'log_lock_waits',
            'deadlock_timeout',
            'client_min_messages',
            'statement_timeout',
            'application_name',
          ] as const)
            if (rows[0]?.[key] !== original[key])
              throw new Error(`Owned contender setting was not restored: ${key}`)
        }
      })())
    },
  }
}
