import { read, write, type QueryExecutor } from '@data-stores/psql'
import type { MembershipProviderSourceIdentity } from '../../../services/memberships/create-types.mts'
import sql from 'sql-template-strings'

export async function createTestMembershipProviderLineage(
  sourceIdentity: MembershipProviderSourceIdentity,
): Promise<void> {
  await write(sql`/* createTestMembershipProviderLineage */
    INSERT INTO membership_provider_lineages (
      membership_provider_context_id, provider_lineage_id, provider_account_id
    ) VALUES (
      fn_upsert_membership_provider_context_id(${sourceIdentity.provider}, ${sourceIdentity.environment}, ${sourceIdentity.applicationId}),
      ${sourceIdentity.providerLineageId}, ${sourceIdentity.providerAccountId ?? null}
    )`)
}

export async function getTestMembershipProviderLineageAccountId(
  sourceIdentity: MembershipProviderSourceIdentity,
): Promise<string | null> {
  const { rows } = await read<{ provider_account_id: string | null }>(
    sql`/* getTestMembershipProviderLineageAccountId */
      SELECT lineage.provider_account_id FROM membership_provider_lineages lineage
      JOIN membership_provider_contexts context ON context.id = lineage.membership_provider_context_id
      WHERE context.provider = ${sourceIdentity.provider} AND context.environment = ${sourceIdentity.environment}
        AND context.application_id = ${sourceIdentity.applicationId}
        AND lineage.provider_lineage_id = ${sourceIdentity.providerLineageId}`,
  )
  return rows[0]?.provider_account_id ?? null
}

export async function runTestMembershipProviderWrite<T>(
  operation: (query: QueryExecutor) => Promise<T>,
): Promise<T> {
  return operation(write)
}
