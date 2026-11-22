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
    if ((await readActiveConsentVersion(query, userId, consentType)) === version) return
    await query(sql`/* ensureConsentVersion:lockDifferentVersion */
      SELECT version FROM user_consents
      WHERE user_id = ${userId}
        AND consent_type = ${consentType}
        AND revoked_at IS NULL
        AND version <> ${version}
      LIMIT 1
      FOR UPDATE
    `)
    await replaceActiveConsentVersion(query, userId, consentType, version)
  }

  if (options?.query) return upgrade(options.query)

  // The matching version is the common case and needs no write transaction.
  return readActiveConsentVersion(read, userId, consentType).then(async activeVersion => {
    if (activeVersion === version) return
    await using query = await beginTransaction()
    const result = await upgrade(query)
    await query.commit()
    return result
  })
}

async function replaceActiveConsentVersion(
  query: QueryExecutor,
  userId: string,
  consentType: ConsentType,
  version: string,
): Promise<void> {
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

async function readActiveConsentVersion(
  query: QueryExecutor,
  userId: string,
  consentType: ConsentType,
): Promise<string | undefined> {
  const { rows } = await query<{ version: string }>(sql`/* readActiveConsentVersion */
    SELECT version FROM user_consents
    WHERE user_id = ${userId}
      AND consent_type = ${consentType}
      AND revoked_at IS NULL
    LIMIT 1
  `)
  return rows[0]?.version
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
