import { Pool } from '@data-stores/psql'

/** Real pg-pool connection waits for worker retry tests, without exposing raw SQL to the test. */
export function createTestPostgresConnectionWaitPool(options: {
  connectionString: string
  connectionTimeoutMillis: number
  max?: number
}) {
  const pool = new Pool(options)
  return {
    queryProbe: async () => {
      await pool.query('/* createTestPostgresConnectionWaitPool */ SELECT 1')
    },
    holdClient: async () => {
      const client = await pool.connect()
      return () => client.release()
    },
    close: () => pool.end(),
  }
}
