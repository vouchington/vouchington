import { writePool } from '@data-stores/psql'

const REFRESH_ADVISORY_LOCK_NAME = 'refresh-materialized-view'
const LOCK_STATEMENT_TIMEOUT = '4s'

export type PlatformStatsRefreshReservation = {
  release(): Promise<void>
}

/** Hold the production refresher's session lock without performing a refresh. */
export async function acquirePlatformStatsRefreshReservation(): Promise<PlatformStatsRefreshReservation> {
  const client = await writePool.connect()
  let previousStatementTimeout: string | undefined
  try {
    const setting = await client.query<{ statement_timeout: string }>(
      '/* acquirePlatformStatsRefreshReservation.readTimeout */ SHOW statement_timeout',
    )
    previousStatementTimeout = setting.rows[0]?.statement_timeout
    await client.query(
      '/* acquirePlatformStatsRefreshReservation.setTimeout */ SELECT set_config($1, $2, false)',
      ['statement_timeout', LOCK_STATEMENT_TIMEOUT],
    )
    await client.query(
      '/* acquirePlatformStatsRefreshReservation.lock */ SELECT pg_advisory_lock(hashtext($1))',
      [REFRESH_ADVISORY_LOCK_NAME],
    )
    if (previousStatementTimeout !== undefined) {
      await client.query(
        '/* acquirePlatformStatsRefreshReservation.restoreTimeout */ SELECT set_config($1, $2, false)',
        ['statement_timeout', previousStatementTimeout],
      )
    }
  } catch (err) {
    client.release(toError(err))
    throw err
  }

  let released = false
  return {
    async release(): Promise<void> {
      if (released) return
      released = true
      try {
        const result = await client.query<{ unlocked: boolean }>(
          '/* acquirePlatformStatsRefreshReservation.unlock */ SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
          [REFRESH_ADVISORY_LOCK_NAME],
        )
        if (!result.rows[0]?.unlocked) {
          throw new Error('PostgreSQL did not release the platform-stats refresh reservation')
        }
        client.release()
      } catch (err) {
        client.release(toError(err))
        throw err
      }
    },
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
