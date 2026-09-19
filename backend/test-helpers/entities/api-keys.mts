import { readFileSync } from 'node:fs'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

const canonicalScopeMigrationSql = readFileSync(
  new URL(
    '../../data-stores/psql/migrations/0634-00-00-api-key-canonical-scopes.sql',
    import.meta.url,
  ),
  'utf8',
)

export async function setTestApiKeyPermissions(
  apiKeyId: string,
  permissions: readonly string[],
): Promise<void> {
  await write(sql`/* setTestApiKeyPermissions */
    UPDATE api_keys
    SET permissions = ${permissions}
    WHERE id = ${apiKeyId}::uuid
  `)
}

export async function migrateTestApiKeyScopeRows(
  rows: ReadonlyArray<{
    id: number
    type: 'mcp' | 'rss'
    permissions: readonly string[]
  }>,
): Promise<Array<{ id: string; permissions: string[] }>> {
  await using query = await beginTransaction()
  await query(`CREATE TEMP TABLE api_keys (
    id bigint PRIMARY KEY,
    type text NOT NULL,
    permissions text[] NOT NULL
  ) ON COMMIT DROP`)
  for (const row of rows) {
    await query('INSERT INTO api_keys (id, type, permissions) VALUES ($1, $2, $3)', [
      row.id,
      row.type,
      row.permissions,
    ])
  }
  await query(canonicalScopeMigrationSql)
  const result = await query('SELECT id, permissions FROM api_keys ORDER BY id')
  return result.rows as Array<{ id: string; permissions: string[] }>
}

export async function attemptInvalidTestApiKeyScopeMigration(input: {
  validApiKeyId: string
  invalidApiKeyId: string
  invalidPermissions: readonly string[]
}): Promise<{ errorMessage: string; validPermissionsAfterRollback: string[] }> {
  const query = await beginTransaction()
  let errorMessage = ''
  try {
    await query('UPDATE api_keys SET permissions = $1 WHERE id = $2::uuid', [
      ['rss-feeds:read'],
      input.validApiKeyId,
    ])
    await query('UPDATE api_keys SET permissions = $1 WHERE id = $2::uuid', [
      input.invalidPermissions,
      input.invalidApiKeyId,
    ])
    await query(canonicalScopeMigrationSql)
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
  } finally {
    await query.rollback()
  }
  const result = await read('SELECT permissions FROM api_keys WHERE id = $1::uuid', [
    input.validApiKeyId,
  ])
  const permissions = result.rows[0]?.permissions
  if (!Array.isArray(permissions) || !permissions.every(value => typeof value === 'string')) {
    throw new TypeError('Expected the valid test API key to retain a string scope array')
  }
  return { errorMessage, validPermissionsAfterRollback: permissions }
}
