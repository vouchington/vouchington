import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestPendingMicrosoftStoreVerification(options: {
  userId: string
  applicationId: string
}): Promise<string | null> {
  const { rows } = await read<{ id: string }>(sql`
    /* getTestPendingMicrosoftStoreVerification */ SELECT verification.id
    FROM membership_verifications verification
    JOIN membership_provider_contexts context ON context.id = verification.membership_provider_context_id
    WHERE verification.user_id = ${options.userId} AND context.provider = 'microsoft_store'
      AND context.environment = 'test' AND context.application_id = ${options.applicationId}
      AND verification.verified_at IS NULL AND verification.conflicted_at IS NULL AND verification.rejected_at IS NULL
    ORDER BY verification.id
    LIMIT 1`)
  return rows[0]?.id ?? null
}

export async function countTestPendingMicrosoftStoreVerifications(options: {
  userId: string
  applicationId: string
}): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`
    /* countTestPendingMicrosoftStoreVerifications */ SELECT count(*)::TEXT AS count
    FROM membership_verifications verification
    JOIN membership_provider_contexts context ON context.id = verification.membership_provider_context_id
    WHERE verification.user_id = ${options.userId} AND context.provider = 'microsoft_store'
      AND context.environment = 'test' AND context.application_id = ${options.applicationId}
      AND verification.verified_at IS NULL AND verification.conflicted_at IS NULL AND verification.rejected_at IS NULL`)
  return Number(rows[0]?.count)
}

export async function countTestMicrosoftStoreVerifications(options: {
  userId: string
  applicationId: string
}): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`
    /* countTestMicrosoftStoreVerifications */ SELECT count(*)::TEXT AS count
    FROM membership_verifications verification
    JOIN membership_provider_contexts context ON context.id = verification.membership_provider_context_id
    WHERE verification.user_id = ${options.userId} AND context.provider = 'microsoft_store'
      AND context.environment = 'test' AND context.application_id = ${options.applicationId}`)
  return Number(rows[0]?.count)
}

export async function makeTestMembershipVerificationDue(verificationId: string): Promise<void> {
  await write(sql`
    /* makeTestMembershipVerificationDue */ UPDATE membership_verification_processing_work_items
    SET available_at = CURRENT_TIMESTAMP
    WHERE membership_verification_id = ${verificationId}`)
}

export async function listTestMicrosoftStoreSourceIds(options: {
  userId: string
  applicationId: string
}): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`
    /* listTestMicrosoftStoreSourceIds */ SELECT source.id
    FROM membership_sources source
    INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN membership_provider_contexts context ON context.id = lineage.membership_provider_context_id
    WHERE source.user_id = ${options.userId} AND context.provider = 'microsoft_store'
      AND context.application_id = ${options.applicationId}
    ORDER BY source.id`)
  return rows.map(row => row.id)
}

export async function getTestMicrosoftStoreCredentials(options: {
  userId: string
  applicationId: string
}): Promise<{ collectionItemId: string; lastVerifiedEndAt: Date } | null> {
  const { rows } = await read<{ collectionItemId: string; lastVerifiedEndAt: Date }>(sql`
    /* getTestMicrosoftStoreCredentials */ SELECT collection_item_id AS "collectionItemId", last_verified_end_at AS "lastVerifiedEndAt"
    FROM membership_microsoft_store_credentials credential
    JOIN membership_provider_contexts context ON context.id = credential.membership_provider_context_id
    WHERE credential.user_id = ${options.userId} AND context.provider = 'microsoft_store'
      AND context.environment = 'test'
      AND context.application_id = ${options.applicationId}`)
  return rows[0] ?? null
}
