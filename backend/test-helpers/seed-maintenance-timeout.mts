import { writePool } from '@data-stores/psql'
import { withSeedMaintenanceTimeout } from '../scripts/explain-analyze/seed-data/maintenance-timeout.mts'

export async function observeSeedMaintenanceTimeout(fail: boolean): Promise<{
  during: string
  after: string
  failed: boolean
}> {
  const client = await writePool.connect()
  let during = ''
  let failed = false
  try {
    await client.query(
      "/* observeSeedMaintenanceTimeout */ SELECT set_config('statement_timeout', '1234ms', false)",
    )
    try {
      await withSeedMaintenanceTimeout(client, async () => {
        const result = await client.query<{ timeout: string }>(
          "/* observeSeedMaintenanceTimeout */ SELECT current_setting('statement_timeout') AS timeout",
        )
        during = result.rows[0]!.timeout
        if (fail) await client.query('/* observeSeedMaintenanceTimeout */ SELECT 1 / 0')
        else
          await client.query(
            '/* observeSeedMaintenanceTimeout */ VACUUM (ANALYZE) pg_catalog.pg_type, pg_catalog.pg_enum',
          )
      })
    } catch (err) {
      if (!(err instanceof Error) || !('code' in err) || err.code !== '22012') throw err
      failed = true
    }
    const result = await client.query<{ timeout: string }>(
      "/* observeSeedMaintenanceTimeout */ SELECT current_setting('statement_timeout') AS timeout",
    )
    return { during, after: result.rows[0]!.timeout, failed }
  } finally {
    // This fixture owns its session and never changes another test's pool settings.
    client.release(true)
  }
}
