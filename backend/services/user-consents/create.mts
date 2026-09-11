import { read, beginTransaction } from '@data-stores/psql'
import type { QueryExecutor, QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ConsentType, UserConsent } from './types.mts'

export function ensureConsentVersion(
  userId: string,
  consentType: ConsentType,
  version: string,
  options?: QueryOptions,
): Promise<void> {
  const upgrade = async (query: QueryExecutor): Promise<void> => {
    const { rows } = await query(sql`/* ensureConsentVersion */
      SELECT version FROM user_consents
      WHERE user_id = ${userId}
        AND consent_type = ${consentType}
        AND revoked_at IS NULL
      LIMIT 1
      FOR UPDATE
    `)
    if (rows[0]?.version === version) return
    await query(sql`/* ensureConsentVersion */
      UPDATE user_consents
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ${userId}
        AND consent_type = ${consentType}
        AND revoked_at IS NULL
        AND version != ${version}
    `)
    await query(sql`/* ensureConsentVersion */
      INSERT INTO user_consents (user_id, consent_type, version)
      VALUES (${userId}, ${consentType}, ${version})
      ON CONFLICT DO NOTHING
    `)
  }

  if (options?.query) return upgrade(options.query)

  // Non-locking pre-read: skip the write transaction when version already matches (common case)
  return read(sql`/* ensureConsentVersion */
    SELECT version FROM user_consents
    WHERE user_id = ${userId}
      AND consent_type = ${consentType}
      AND revoked_at IS NULL
    LIMIT 1
  `).then(async ({ rows }) => {
    if (rows[0]?.version === version) return
    await using query = await beginTransaction()
    const result = await upgrade(query)
    await query.commit()
    return result
  })
}

export async function grantConsent(
  userId: string,
  consentType: ConsentType,
  version: string,
  options?: QueryOptions,
): Promise<UserConsent> {
  const run = async (query: QueryExecutor): Promise<UserConsent> => {
    await query(sql`/* grantConsent */
      UPDATE user_consents
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ${userId}
        AND consent_type = ${consentType}
        AND revoked_at IS NULL
    `)

    const { rows } = await query(sql`/* grantConsent */
      INSERT INTO user_consents (user_id, consent_type, version)
      VALUES (${userId}, ${consentType}, ${version})
      RETURNING id, user_id, consent_type, version, created_at, revoked_at
    `)

    return rows[0] as UserConsent
  }

  if (options?.query) return run(options.query)
  await using query = await beginTransaction()
  const result = await run(query)
  await query.commit()
  return result
}
