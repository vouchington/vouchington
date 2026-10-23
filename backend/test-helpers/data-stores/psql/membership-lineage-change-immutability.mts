import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestRetainedMembershipIdentity } from '../../entities/retained-identities.mts'
import { createLocalTestUser } from './users.mts'

type QueryResult = { rowCount: number | null }

export async function createTestImmutableLineageBinding(): Promise<string> {
  const user = await createLocalTestUser()
  const applicationId = `binding-immutable-${randomUUID()}`
  const { rows } = await write<{ id: string }>(sql`/* createImmutableTestBinding */
    WITH lineage AS (INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id) VALUES (fn_upsert_membership_provider_context_id('stripe', 'test', ${applicationId}), ${`lineage-${randomUUID()}`}) RETURNING id)
    INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id) SELECT id, ${user.id} FROM lineage RETURNING id`)
  return rows[0]!.id
}

export function setTestLineageBindingOriginatingInvoice(
  bindingId: string,
  invoiceId: string,
): Promise<QueryResult> {
  return write(
    sql`/* setTestLineageBindingOriginatingInvoice */ UPDATE membership_lineage_bindings SET originating_invoice_id = ${invoiceId} WHERE id = ${bindingId}`,
  )
}

export async function createTestImmutableMembershipChange(): Promise<string> {
  const changeId = randomUUID()
  await write(
    sql`/* createImmutableTestMembershipChange */ WITH actor AS (INSERT INTO users DEFAULT VALUES RETURNING id) INSERT INTO membership_changes (id, membership_id, user_id, change_type, note) SELECT ${changeId}, ${await createTestRetainedMembershipIdentity()}, id, 'admin_grant', 'original' FROM actor`,
  )
  return changeId
}

export function mutateTestMembershipChange(changeId: string): Promise<QueryResult> {
  return write(
    sql`/* mutateTestMembershipChange */ UPDATE membership_changes SET note = 'rewritten' WHERE id = ${changeId}`,
  )
}
export function deleteTestMembershipChange(changeId: string): Promise<QueryResult> {
  return write(
    sql`/* deleteTestMembershipChange */ DELETE FROM membership_changes WHERE id = ${changeId}`,
  )
}
