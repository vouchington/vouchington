import { read, write, type QueryExecutor } from '@data-stores/psql'
import type { MembershipProviderSourceIdentity } from '../../../services/memberships/create-types.mts'
import sql from 'sql-template-strings'

export async function createTestMembershipProviderLineage(
  sourceIdentity: MembershipProviderSourceIdentity,
): Promise<void> {
  await write(sql`/* createTestMembershipProviderLineage */
    INSERT INTO membership_provider_lineages (
      provider, environment, application_id, provider_lineage_id, provider_account_id
    ) VALUES (
      ${sourceIdentity.provider}, ${sourceIdentity.environment}, ${sourceIdentity.applicationId},
      ${sourceIdentity.providerLineageId}, ${sourceIdentity.providerAccountId ?? null}
    )`)
}

export async function getTestMembershipProviderLineageAccountId(
  sourceIdentity: MembershipProviderSourceIdentity,
): Promise<string | null> {
  const { rows } = await read<{ provider_account_id: string | null }>(
    sql`/* getTestMembershipProviderLineageAccountId */
      SELECT provider_account_id FROM membership_provider_lineages
      WHERE provider = ${sourceIdentity.provider} AND environment = ${sourceIdentity.environment}
        AND application_id = ${sourceIdentity.applicationId}
        AND provider_lineage_id = ${sourceIdentity.providerLineageId}`,
  )
  return rows[0]?.provider_account_id ?? null
}

export async function runTestMembershipProviderWrite<T>(
  operation: (query: QueryExecutor) => Promise<T>,
): Promise<T> {
  return operation(write)
}
