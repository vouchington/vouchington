import type { PoolClient } from '@data-stores/psql/types'

/** Bulk seed maintenance has a finite budget distinct from application statements. */
export async function withSeedMaintenanceTimeout<T>(
  client: PoolClient,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = await client.query<{ timeout: string }>(
    "/* withSeedMaintenanceTimeout */ SELECT current_setting('statement_timeout') AS timeout",
  )
  const timeout = previous.rows[0]!.timeout
  try {
    await client.query(
      "/* withSeedMaintenanceTimeout */ SELECT set_config('statement_timeout', '180000', false)",
    )
    return await operation()
  } finally {
    await client.query(
      "/* withSeedMaintenanceTimeout */ SELECT set_config('statement_timeout', $1, false)",
      [timeout],
    )
  }
}
