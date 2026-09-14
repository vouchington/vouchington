import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestPendingMicrosoftStoreVerification(options: {
  userId: string
  applicationId: string
}): Promise<string | null> {
  const { rows } = await read<{ id: string }>(sql`
    /* getTestPendingMicrosoftStoreVerification */ SELECT id
    FROM membership_verifications
    WHERE user_id = ${options.userId} AND provider = 'microsoft_store'
      AND environment = 'test' AND application_id = ${options.applicationId}
      AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL
    ORDER BY id
    LIMIT 1`)
  return rows[0]?.id ?? null
}

export async function countTestPendingMicrosoftStoreVerifications(options: {
  userId: string
  applicationId: string
}): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`
    /* countTestPendingMicrosoftStoreVerifications */ SELECT count(*)::TEXT AS count
    FROM membership_verifications
    WHERE user_id = ${options.userId} AND provider = 'microsoft_store'
      AND environment = 'test' AND application_id = ${options.applicationId}
      AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`)
  return Number(rows[0]?.count)
}

export async function countTestMicrosoftStoreVerifications(options: {
  userId: string
  applicationId: string
}): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`
    /* countTestMicrosoftStoreVerifications */ SELECT count(*)::TEXT AS count
    FROM membership_verifications
    WHERE user_id = ${options.userId} AND provider = 'microsoft_store'
      AND environment = 'test' AND application_id = ${options.applicationId}`)
  return Number(rows[0]?.count)
}

export async function makeTestMembershipVerificationDue(verificationId: string): Promise<void> {
  await write(sql`
    /* makeTestMembershipVerificationDue */ UPDATE membership_verifications
    SET next_processing_at = CURRENT_TIMESTAMP
    WHERE id = ${verificationId}`)
}

export async function listTestMicrosoftStoreSourceIds(options: {
  userId: string
  applicationId: string
}): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`
    /* listTestMicrosoftStoreSourceIds */ SELECT source.id
    FROM membership_sources source
    INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    WHERE source.user_id = ${options.userId} AND lineage.provider = 'microsoft_store'
      AND lineage.application_id = ${options.applicationId}
    ORDER BY source.id`)
  return rows.map(row => row.id)
}

export async function getTestMicrosoftStoreCredentials(options: {
  userId: string
  applicationId: string
}): Promise<{ collectionItemId: string; lastVerifiedEndAt: Date } | null> {
  const { rows } = await read<{ collectionItemId: string; lastVerifiedEndAt: Date }>(sql`
    /* getTestMicrosoftStoreCredentials */ SELECT collection_item_id AS "collectionItemId", last_verified_end_at AS "lastVerifiedEndAt"
    FROM membership_microsoft_store_credentials
    WHERE user_id = ${options.userId} AND environment = 'test'
      AND application_id = ${options.applicationId}`)
  return rows[0] ?? null
}
