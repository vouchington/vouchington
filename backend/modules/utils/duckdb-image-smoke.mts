import assert from 'node:assert/strict'
import { DuckDBInstance } from '@duckdb/node-api'

// Called only by the existing image smoke command, using the shipped executable's
// embedded native addon and the image's libduckdb.so rather than host dependencies.
export async function checkDuckDbRuntime(): Promise<void> {
  const instance = await DuckDBInstance.create(':memory:')
  try {
    const connection = await instance.connect()
    try {
      const reader = await connection.runAndReadAll(
        'SELECT 42::INTEGER AS smoke_value, version() AS runtime_version',
      )
      const rows = reader.getRowObjectsJson()
      const row = rows[0]
      assert.equal(rows.length, 1, 'DuckDB image smoke must return one row')
      assert.equal(row?.smoke_value, 42, 'DuckDB image smoke must return the expected value')
      assert.ok(typeof row?.runtime_version === 'string' && row.runtime_version.length > 0)
      console.log(`✓ DuckDB native query returned 42 (runtime ${row.runtime_version})`)
    } finally {
      connection.disconnectSync()
    }
  } finally {
    instance.closeSync()
  }
}
