import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

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
