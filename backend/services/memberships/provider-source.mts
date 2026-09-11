import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  CreateProviderMembershipSourceOptions,
  MembershipProviderSourceKind,
} from './create-types.mts'

export async function createProviderMembershipSource<
  SourceKind extends MembershipProviderSourceKind,
>(
  options: CreateProviderMembershipSourceOptions & { sourceKind: SourceKind },
  query: QueryExecutor,
): Promise<{
  id: string
  kind: SourceKind
  bindingId: string
  lineageId: string
}> {
  if (
    options.stripeOriginatingInvoiceId !== undefined &&
    (options.sourceKind !== 'direct' || options.sourceIdentity.provider !== 'stripe')
  )
    throw new Error('Only direct Stripe sources may bind an originating invoice')

  const lineage = await createOrLockProviderLineage(options, query)
  assertProviderAccountMatches(lineage.provider_account_id, options)
  const { binding, source } = await createProviderSourceRecords(options, lineage.id, query)
  return { id: source.id, kind: options.sourceKind, bindingId: binding.id, lineageId: lineage.id }
}

async function createProviderSourceRecords(
  options: CreateProviderMembershipSourceOptions,
  lineageId: string,
  query: QueryExecutor,
) {
  const binding = await createOrLockProviderLineageBinding(options, lineageId, query)
  const source = await createOrLockProviderSource(options, lineageId, query)
  return { binding, source }
}

async function createOrLockProviderLineage(
  options: CreateProviderMembershipSourceOptions,
  query: QueryExecutor,
): Promise<{ id: string; provider_account_id: string | null }> {
  const { sourceIdentity } = options
  const { rows: insertedRows } = await query(sql`/* createMembership: provider lineage */
    INSERT INTO membership_provider_lineages (
      provider, environment, application_id, provider_lineage_id, provider_account_id
    ) VALUES (
      ${sourceIdentity.provider}, ${sourceIdentity.environment}, ${sourceIdentity.applicationId},
      ${sourceIdentity.providerLineageId}, ${sourceIdentity.providerAccountId ?? null}
    ) ON CONFLICT (provider, environment, application_id, provider_lineage_id)
    DO NOTHING
    RETURNING id, provider_account_id`)
  const inserted = insertedRows[0] as { id: string; provider_account_id: string | null } | undefined
  if (inserted) return inserted
  const { rows } = await query(sql`/* createMembership: lock provider lineage */
    SELECT id, provider_account_id FROM membership_provider_lineages
    WHERE provider = ${sourceIdentity.provider}
      AND environment = ${sourceIdentity.environment}
      AND application_id = ${sourceIdentity.applicationId}
      AND provider_lineage_id = ${sourceIdentity.providerLineageId}
    FOR KEY SHARE`)
  return rows[0] as { id: string; provider_account_id: string | null }
}

function assertProviderAccountMatches(
  providerAccountId: string | null,
  options: CreateProviderMembershipSourceOptions,
): void {
  if (
    options.sourceIdentity.providerAccountId !== undefined &&
    providerAccountId !== options.sourceIdentity.providerAccountId
  )
    throw new Error('Provider lineage account does not match the incoming evidence')
}

async function createOrLockProviderLineageBinding(
  options: CreateProviderMembershipSourceOptions,
  lineageId: string,
  query: QueryExecutor,
): Promise<{ id: string; originating_invoice_id: string | null }> {
  await query(sql`/* createMembership: bind provider lineage */
    INSERT INTO membership_lineage_bindings (
      membership_provider_lineage_id, user_id, source_kind, originating_invoice_id
    ) VALUES (
      ${lineageId}, ${options.userId}, ${options.sourceKind},
      ${options.stripeOriginatingInvoiceId ?? null}
    )
    ON CONFLICT DO NOTHING`)
  const { rows } = await query(sql`/* createMembership: lock provider binding */
    SELECT id, user_id, originating_invoice_id FROM membership_lineage_bindings
    WHERE membership_provider_lineage_id = ${lineageId}
      AND source_kind = ${options.sourceKind}
      AND released_at IS NULL
      AND (${options.sourceKind} = 'direct' OR user_id = ${options.userId})
    FOR UPDATE`)
  let binding = rows[0] as
    | { id: string; user_id: string; originating_invoice_id: string | null }
    | undefined
  if (binding?.user_id !== options.userId)
    throw new Error('Provider lineage is bound to another account')
  if (options.stripeOriginatingInvoiceId && binding.originating_invoice_id === null) {
    await query(sql`/* createMembership: fill Stripe originating invoice */
      UPDATE membership_lineage_bindings
      SET originating_invoice_id = ${options.stripeOriginatingInvoiceId}
      WHERE id = ${binding.id} AND originating_invoice_id IS NULL`)
    binding = { ...binding, originating_invoice_id: options.stripeOriginatingInvoiceId }
  }
  if (
    options.stripeOriginatingInvoiceId &&
    binding.originating_invoice_id !== options.stripeOriginatingInvoiceId
  )
    throw new Error('Stripe lineage binding originating invoice does not match the incoming event')
  return binding
}

async function createOrLockProviderSource(
  options: CreateProviderMembershipSourceOptions,
  lineageId: string,
  query: QueryExecutor,
): Promise<{ id: string; user_id: string | null; source_kind: MembershipProviderSourceKind }> {
  await query(sql`/* createMembership: provider source */
    INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
    VALUES (${options.userId}, ${options.sourceKind}, ${lineageId}) ON CONFLICT DO NOTHING`)
  const { rows } = await query(sql`/* createMembership: lock provider source */
    SELECT id, user_id, source_kind FROM membership_sources
    WHERE membership_provider_lineage_id = ${lineageId}
      AND source_kind = ${options.sourceKind}
      AND (${options.sourceKind} = 'direct' OR user_id = ${options.userId})
    FOR UPDATE`)
  let source = rows[0] as
    | {
        id: string
        user_id: string | null
        source_kind: MembershipProviderSourceKind
      }
    | undefined
  if (options.sourceKind === 'direct' && source?.user_id === null) {
    const { rows: reboundRows } =
      await query(sql`/* createMembership: rebind released provider source */
      UPDATE membership_sources
      SET user_id = ${options.userId}
      WHERE id = ${source.id} AND user_id IS NULL
      RETURNING id, user_id, source_kind`)
    source = reboundRows[0] as
      | {
          id: string
          user_id: string | null
          source_kind: MembershipProviderSourceKind
        }
      | undefined
  }
  if (!source || source.user_id !== options.userId || source.source_kind !== options.sourceKind)
    throw new Error('Provider source belongs to another account')
  return source
}
