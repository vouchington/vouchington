import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { flush } from '@data-stores/analytics/backend-local'
import { closeConnection, query } from '@data-stores/analytics/query'

const ANALYTICS_ENV_NAMES = ['ANALYTICS_BACKEND', 'ANALYTICS_LOCAL_DIR'] as const

/**
 * Points analytics at a throwaway local directory so a test can read back what it emitted.
 * Returns the function that restores the environment and removes the directory.
 *
 * The query connection pins each table's view to the directory it first saw, and `isolate: false`
 * shares that connection between test files in one fork, so it is closed on the way in and out.
 */
export async function startLocalAnalyticsForTest(prefix: string): Promise<() => Promise<void>> {
  const originals = ANALYTICS_ENV_NAMES.map(name => process.env[name])
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix))
  process.env.ANALYTICS_BACKEND = 'local'
  process.env.ANALYTICS_LOCAL_DIR = directory
  await closeConnection()
  return async () => {
    await flush()
    await closeConnection()
    ANALYTICS_ENV_NAMES.forEach((name, index) => {
      const original = originals[index]
      if (original === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = original
    })
    await fs.promises.rm(directory, { recursive: true, force: true })
  }
}

/**
 * The `api_usage` rows one user produced, ordered by status code. The filter is a plain equality so
 * it also runs on the JSONL fallback that has no DuckDB; the ordering happens here.
 */
export async function readApiUsageRows(userId: string) {
  await flush()
  const rows = await query(`SELECT * FROM api_usage WHERE user_id = '${userId}'`)
  return rows.toSorted((a, b) => Number(a.status_code) - Number(b.status_code))
}

/**
 * The `api_usage` rows of anonymous REST traffic, which has no user to filter on. A caller that
 * counts its own rows should start from a fresh analytics directory.
 */
export async function readAnonymousApiUsageRows() {
  await flush()
  const rows = await query(`SELECT * FROM api_usage WHERE surface = 'rest_anonymous'`)
  return rows.sort((a, b) => Number(a.status_code) - Number(b.status_code))
}
